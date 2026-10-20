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
  // odkaz na srovnávač jen z nabídek pro tatáž letiště a časy (nabídky se načítají asynchronně – mohou být ke starým)
  const carLinkFor = q => { const j = carsData && carsData.query; return q && j && j.pickup === q.pickup && j.dropoff === (q.dropoff || q.pickup) && j.from === q.from && j.to === q.to ? carsData.links[0]?.url || null : null; };
  const staysCache = new Map(); // nabídky ubytování podle dotazu (místo|termín|osoby) – přepínání míst trasy
  const staysLoading = new Map(); // klíč → rozběhnutý dotaz api/stays (místo načítané dopředu a jeho záložka jedním)
  let staysRetry = null; // klíč dotazu, který se má po „Zkusit znovu“ přepočítat (retry=1 – server přeskočí neúplný výsledek)
  // ↻ Aktualizovat ceny (fresh=1 – server zjistí ceny hotelů znovu): { key, run: true } během dotazu, { key, fail: chyba }
  // po nepovedeném – nabídky z dřívějška zatím zůstanou na obrazovce (freshStays)
  let staysUpd = null;
  let staySlot = null; // kam se ukládá vybraný hotel: celý pobyt (t.stay), nebo jedno místo trasy (base.stay)
  let pickSeq = 0; // každá volba ubytování ho zvýší – pozdě doběhlé ověření volna starší volbu už nevybere
  let stayIdx = 0; // místo trasy v kroku Ubytování
  let progIdx = 0; // místo trasy v kroku Program
  let routeSeq = 0; // jen poslední odpověď návrhu/přepočtu trasy se vykreslí
  let routeMapPaint = null;
  let entryWait = false; // čeká se na vstupní podmínky (poznámka u přechodu hranice)
  let routePoll = null; // přepočet přejezdů, které server ještě počítá (trasa autem)
  const MAX_BASES = 6;
  const BASE_COLORS = ['#5b8cff', '#f59e0b', '#22c55e', '#ec4899', '#14b8a6', '#a855f7'];

  /* ---------- pomocné ---------- */
  const T = () => S.trip;
  const persist = () => save();
  const addDaysYmd = (ymd, n) => { const d = new Date(ymd + 'T12:00:00'); d.setDate(d.getDate() + n); return fmtYMD(d); };
  const dayLbl = ymd => { const d = new Date(ymd + 'T12:00:00'); return `${DOW[d.getDay()]} ${d.getDate()}. ${d.getMonth() + 1}.`; };
  const hhmm = s => (s && s.length >= 16 ? s.slice(11, 16) : '');
  // příjezd / přílet další den (noční let, noční bus) → „00:51 +1“ jako ve výsledcích
  const plusDay = (from, to) => { const n = from && to ? Math.round((Date.parse(to.slice(0, 10)) - Date.parse(from.slice(0, 10))) / 864e5) : 0; return n > 0 ? ` +${n}` : ''; };
  const arrHm = l => (l.arr && l.hasTime ? (l.arrEst ? '~' : '') + hhmm(l.arr) + plusDay(l.date, l.arr) : '');
  // odlet: let bez času (cena z mezipaměti, den Ryanairu) nemá vymyšlenou půlnoc
  const depHm = l => (l.hasTime === false ? '' : hhmm(l.dep));
  const nightsTxt = n => n === 1 ? '1 noc' : n >= 2 && n <= 4 ? `${n} noci` : `${n} nocí`;
  const daysTxt = n => n === 1 ? '1 den' : n >= 2 && n <= 4 ? `${n} dny` : `${n} dní`;
  const minutesToHm = m => m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) + ' min' : ''}` : `${m} min`;
  const stars = n => n ? '★'.repeat(Math.round(n)) : '';
  const ratingWord = r => r >= 9 ? 'Výjimečné' : r >= 8.5 ? 'Vynikající' : r >= 8 ? 'Velmi dobré' : r >= 7 ? 'Dobré' : r >= 6 ? 'Ucházející' : 'Slabé';
  // hodnocení TripAdvisoru 0–5 (Xotelo) – slova jako na TripAdvisoru, ne podle stupnice 0–10
  const ratingWord5 = r => r >= 4.5 ? 'Výborné' : r >= 4 ? 'Velmi dobré' : r >= 3.5 ? 'Dobré' : r >= 3 ? 'Průměrné' : 'Slabé';
  const dec1 = x => Number(x).toFixed(1).replace('.', ','); // 8,9 – desetinná čárka
  const reviewsTxt = n => `${n.toLocaleString('cs')} ${n >= 1 && n <= 4 ? 'recenze' : 'recenzí'}`;

  /** Přílet tam: čas příletu, nebo odlet + délka letu, nebo poledne (neznámý přílet – let s přestupem z cache – nejdřív v čas odletu). */
  function arrivalAt(leg) {
    if (leg.arr && leg.hasTime) return leg.arr.slice(0, 16);
    if (leg.hasTime && leg.durationMin) {
      const d = new Date(leg.dep.slice(0, 16) + ':00Z'); d.setUTCMinutes(d.getUTCMinutes() + leg.durationMin);
      return d.toISOString().slice(0, 16);
    }
    const noon = `${leg.date}T12:00`, dep = leg.hasTime ? String(leg.dep).slice(0, 16) : '';
    return dep > noon ? dep : noon;
  }
  function shiftDt(dt, minutes) {
    const d = new Date(dt.slice(0, 16) + ':00Z'); d.setUTCMinutes(d.getUTCMinutes() + minutes);
    return d.toISOString().slice(0, 16);
  }
  // Jako shiftDt, ale přes skutečný okamžik v zóně tz – v noci změny času (6:30 v neděli ráno) posun o hodinu nespadne vedle.
  function shiftTz(dt, minutes, tz) {
    const u = tz && window.Ics ? Ics.localToUtc(dt.slice(0, 16), tz) : null;
    const off = u == null ? null : Ics.tzOffset(tz, u + minutes * 60000);
    return off == null ? shiftDt(dt, minutes) : new Date(u + (minutes + off) * 60000).toISOString().slice(0, 16);
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
  const gTime = g => (g.dep ? `${hhmm(g.dep)} → ${hhmm(g.arr)}${plusDay(g.dep, g.arr)}` : `~${minutesToHm(g.min || 0)}, čas ověř`);
  // Odkaz na jízdenku: RegioJet u vybraného spoje, jinak první odkaz (RegioJet, FlixBus, IDOS).
  const gUrl = (g, links) => ((links || []).find(l => l.id === (g.source === 'regiojet' ? 'regiojet' : l.id)) || {}).url || null;
  const gWho = g => (g.source === 'regiojet' ? (g.demo ? 'RegioJet DEMO' : 'RegioJet') : 'odhad');
  // Cena úseku: spoj RegioJetu přesně, odhad „běžně ~450 Kč (od ~299 Kč)“ (do ceny cesty jde běžná), starší odhad „od ~299 Kč“.
  const gPrice = g => (g.source === 'regiojet' ? czk(g.czk) : g.fromCzk > 0 ? `běžně ~${czk(g.czk)}${g.fromCzk < g.czk ? ` (od ~${czk(g.fromCzk)})` : ''}` : `od ~${czk(g.czk)}`);
  /**
   * Trasa přes víc míst s vlakem/busem: přejezd z města příjezdu na 1. místo a z posledního místa zpět k vlaku/busu
   * (přejezdy k letišti letu tu neplatí). Spočítá je server stejně jako ostatní přejezdy (api/stayplan s ground →
   * groundLegs); platí pro město příjezdu a první/poslední místo, pro které se počítaly – jinak se dopočítají znovu.
   */
  const groundKey = t => {
    const ov = t.overland, bs = t.route.bases, ll = p => `${(+p.lat).toFixed(3)},${(+p.lon).toFixed(3)}`;
    return bs.length ? [ll(ov.to), ll(bs[0]), ll(bs[bs.length - 1])].join('|') : '';
  };
  const groundPlace = t => ({ name: t.overland.to.label, lat: t.overland.to.lat, lon: t.overland.to.lon, cc: t.overland.to.cc || '' });
  function overlandLegs(t) {
    const ov = t.overland, r = t.route, bs = r.bases;
    if (!bs.length) return { arrival: null, departure: null };
    const g = r.groundLegs && r.groundLegs.key === groundKey(t) ? r.groundLegs : {};
    // místo ve městě příjezdu – přejezd se neukazuje
    const leg = (p, x) => (distKm(ov.to, p) < 5 ? { km: 0, carMin: 0, transitMin: 0 } : x || null);
    return { arrival: leg(bs[0], g.arrival), departure: ov.back ? leg(bs[bs.length - 1], g.departure) : null };
  }
  /** Upozornění k trase; s vlakem/busem místo „daleko na letiště odletu“ (ze serveru) daleko zpět k vlaku/busu. */
  function routeNotes(t) {
    const r = t.route, notes = r.notes || [];
    if (!ovOn(t) || !r.bases.length) return notes;
    const x = overlandLegs(t).departure;
    return [...notes.filter(n => !/^Z posledního místa \(.*\) na letiště /.test(n)),
      ...(x && x.long ? [`Z posledního místa (${r.bases[r.bases.length - 1].name}) zpět k vlaku / busu (${t.overland.to.label}) je to ~${minutesToHm(legMin(x, r.transport))} – v den odjezdu vyraz včas, nebo poslední noc stráv blíž.`] : [])];
  }

  // Přílet po půlnoci (do 5:00) → pokoj už od předchozího večera, ať je kde přespat.
  const checkinOf = l => { const a = arrivalAt(l); return l.hasTime && +a.slice(11, 13) < 5 ? addDaysYmd(a.slice(0, 10), -1) : a.slice(0, 10); };
  const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
  function stayDates(t) {
    const o = outLeg(t), b = backLeg(t);
    const checkin = checkinOf(o);
    // cesta přes víc měst jen tam: pobyt končí nocemi v posledním městě (od příletu posledního letu)
    const last = !b && isFly(t) ? midLegs(t).at(-1) : null;
    const checkout = b ? b.date : addDaysYmd(last ? checkinOf(last) : checkin, t.nightsOneWay || 3);
    return { checkin, checkout, nights: Math.max(0, daysBetween(checkin, checkout)) };
  }

  /* ---------- cesta přes víc měst letadlem (3 a víc letů s návratem domů) ---------- */
  /** Lety mezi místy trasy (bez letu tam a zpět). */
  const midLegs = t => (t && t.flight && Array.isArray(t.flight.mid) ? t.flight.mid : []);
  /** Všechny lety cesty v pořadí: tam, mezi místy, zpět. */
  const allLegs = t => [t.flight.out, ...midLegs(t), t.flight.back].filter(Boolean);
  /** Trasu dávají lety: místa jsou cíle letů, mezi místy se letí, noci jsou dané daty letů (bez vlaku/busu místo letu). */
  const isFly = t => Boolean(t && t.route && t.route.fixed === 'flights' && midLegs(t).length && !ovOn(t)
    && Array.isArray(t.route.bases) && t.route.bases.length === midLegs(t).length + 1);
  /**
   * Místa trasy podle letů (f = { out, mid, back }, stops = cíle letů { label, lat, lon, cc, country, id }): i-té místo
   * od příletu i-tého letu do odletu dalšího (bez letu zpět poslední město last nocí) → pole míst, nebo null (místo
   * bez noci či bez polohy – pak jen do plánovače).
   */
  function flyBases(f, stops, last = 3) {
    const arr = [f.out, ...(f.mid || [])], dep = [...(f.mid || []), f.back || null];
    if (!Array.isArray(stops) || stops.length !== arr.length) return null;
    const bases = arr.map((l, i) => {
      const s = stops[i], nights = dep[i] ? daysBetween(checkinOf(l), dep[i].date) : last;
      if (!s || !Number.isFinite(s.lat) || !Number.isFinite(s.lon) || !(nights >= 1 && nights <= 30)) return null;
      return {
        id: /^[\w:.,-]{1,100}$/.test(s.id || '') ? s.id : `fly${i}`, name: String(s.label || l.to).replace(/ \(.*\)$/, '').slice(0, 80), nameEn: '',
        lat: s.lat, lon: s.lon, cc: /^[A-Z]{2}$/.test(s.cc || '') ? s.cc : '', country: String(s.country || '').slice(0, 60), anchor: null, reason: '', highlights: [], nights, stay: null, plan: null,
      };
    });
    return bases.every(Boolean) ? bases : null;
  }
  /** Jdou vybrané lety do průvodce? (každé místo aspoň 1 noc, nejvýš MAX_BASES míst) */
  const flyOk = (f, stops) => (f.mid || []).length + 1 <= MAX_BASES && Boolean(flyBases(f, stops));
  /**
   * Trasa podle letů: další let odlétá z letiště, ke kterému z místa i nevede cesta z letiště do města (přiletíš do Říma,
   * letíš z Neapole) → { i, b, a, d, key } – přejezd z místa na to letiště spočítá server (loadGaps, api/stayplan);
   * druhé letiště téhož města (CIA → FCO) s cestou z města na letiště z hledání null.
   */
  function gapAt(t, i) {
    const r = t.route, mid = midLegs(t), b = r.bases[i], a = i ? mid[i - 1] : t.flight.out, d = mid[i] || t.flight.back;
    if (!b || !a || !d || a.to === d.from) return null;
    const c = mid[i] ? ((t.arrival && Array.isArray(t.arrival.mid) && t.arrival.mid[i]) || {}).from : t.arrival && t.arrival.back;
    if (c && Number.isFinite(c.lat) && distKm(b, c) <= 40) return null;
    return { i, b, a, d, key: `g${i}${d.from}` };
  }
  /** Spočítaný přejezd k mezeře (null = zatím nespočítaný, false = nepovedl se). */
  const gapLeg = (t, g) => (g && t.route.gaps && Object.hasOwn(t.route.gaps, g.key) ? t.route.gaps[g.key] : null);

  /** Víc míst (aspoň 2) a pobyt aspoň 2 noci; jinak jedno místo celý pobyt jako dřív. */
  const isMulti = t => Boolean(t && t.route && t.route.mode === 'multi' && Array.isArray(t.route.bases) && t.route.bases.length >= 2 && stayDates(t).nights >= 2);
  /** Termíny míst trasy: navazují na sebe (check-out jednoho místa = check-in dalšího); u trasy podle letů od příletu
   *  do odletu dalšího letu (noc v letadle mezi nimi do žádného místa nepatří). */
  function baseDates(t) {
    if (isFly(t)) {
      const arr = [t.flight.out, ...midLegs(t)], dep = [...midLegs(t), t.flight.back || null];
      return t.route.bases.map((b, i) => {
        const checkin = checkinOf(arr[i]), checkout = dep[i] ? dep[i].date : addDaysYmd(checkin, t.nightsOneWay || 3);
        return { checkin, checkout, nights: daysBetween(checkin, checkout) };
      });
    }
    let d = stayDates(t).checkin;
    return t.route.bases.map(b => { const checkin = d; d = addDaysYmd(d, b.nights); return { checkin, checkout: d, nights: b.nights }; });
  }
  /** Kolik nocí pobytu zbývá rozdělit (záporné = rozděleno víc, než pobyt trvá); trasa podle letů je rozdělená vždy. */
  const nightsLeft = t => (isFly(t) ? 0 : stayDates(t).nights - t.route.bases.reduce((s, b) => s + b.nights, 0));
  // Cena vybraného ubytování (hotel nebo ručně zadaná cena; „jen odkazy“ a „neřeším“ = 0).
  const stayCzk = s => s && (s.mode === 'pick' || s.mode === 'manual') ? Math.round(s.totalCzk || 0) : 0;
  const hotelName = s => s && (s.mode === 'pick' || s.mode === 'manual') ? s.name || '' : '';
  // hotel z okolí místa (malé místo bez hotelů na TripAdvisoru): „ (Noto)“
  const nearOf = s => s && s.mode === 'pick' && s.near ? ` (${s.near})` : '';
  // Veřejná doprava přejezdu (ze serveru): 'rail' = mezi městy se jezdí vlakem, 'bus' = autobusy a minibusy;
  // přímý vlak z tabulky spojů (fast, čas podle jízdního řádu) jen „vlakem“.
  const trIcon = (tr, x) => tr === 'transit' ? (x && x.transitKind === 'bus' ? '🚌' : '🚆') : '🚗';
  const kindTxt = x => (x && x.transitKind === 'bus' ? 'autobusem / minibusem' : x && x.fast ? 'vlakem' : 'vlakem / busem');
  const legMin = (x, tr) => x ? (tr === 'transit' ? x.transitMin : x.carMin) : null;
  const legTxt = (x, tr) => tr === 'transit' ? `~${minutesToHm(x.transitMin)} ${kindTxt(x)}` : `${x.km} km · ~${minutesToHm(x.carMin)} autem`;
  // Autem podle trasy z plánovače (s provozem a hranicí), jinak odhad; veřejná doprava je odhad, jen přímý vlak
  // z tabulky spojů (fast ze serveru) má čas podle jízdního řádu.
  const estTxt = (x, tr) => (tr === 'transit' ? (x.fast ? 'jízdní řád' : 'odhad') : x.basis === 'route' ? 'podle trasy' : 'odhad');
  const ccName = cc => (typeof byIso !== 'undefined' && byIso[cc] ? byIso[cc].cs : cc);
  /** Přechod hranice na přejezdu: s čím počítat (vstupní podmínky další země, jsou-li načtené) a odkaz na ně. */
  function borderNote(bd) {
    if (!bd || !/^[A-Z]{2}$/.test(bd.from || '') || !/^[A-Z]{2}$/.test(bd.to || '')) return '';
    const r = window.Entry && Entry.ready() ? Entry.get(bd.to) : null, k = r ? Entry.kind(r) : null, to = ccName(bd.to);
    // bezvízový režim s prošlým datem konce → jako neznámé podmínky
    const need = !k || (!k.need && Entry.over && Entry.over(r)) ? 'kontrolou a vízem – ověř podmínky vstupu' : k.key === 'op' ? `kontrolou dokladů (${to}: ${k.label})` : k.need ? `kontrolou a vízem (${to}: ${k.label})` : `kontrolou pasu (${to}: ${k.label})`;
    return `<div class="rt-border">🛂 přechod hranice ${esc(ccName(bd.from))} → ${esc(to)} – počítej s ${esc(need)}${typeof openCountry === 'function' ? ` · <button type="button" class="linkbtn" data-entry="${esc(bd.to)}">podmínky vstupu ›</button>` : ''}</div>`;
  }
  const legUrl = (x, tr) => x && (tr === 'transit' ? x.transitUrl : x.carUrl);
  // přechod hranice krátce (časová osa, plánovač)
  const borderTxt = x => (x && x.border ? ` · 🛂 hranice ${ccName(x.border.from)} → ${ccName(x.border.to)}` : '');
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
  // Program platí pro termín i časy příjezdu a odjezdu, pro které ho plánovač sestavil (jako sameSpan v places.js).
  const spanOk = (s, w) => s.start === w.start && s.end === w.end && s.arrivalTime === (w.arrivalTime || null) && s.departureTime === (w.departureTime || null);
  /** Program místa trasy, jen když platí pro jeho současný termín (po změně nocí, pořadí nebo spoje ho krok Program sestaví znovu). */
  function basePlan(t, i) {
    const p = t.route.bases[i].plan;
    if (!p || !Array.isArray(p.days)) return null;
    const w = baseProgram(t, i), s = p.span;
    return (s ? spanOk(s, w) : p.days.every(d => d.date >= w.start && d.date <= w.end)) ? p : null;
  }
  /** Termín programu jednoho místa: od dne příjezdu do check-outu, s časem příjezdu a odjezdu. */
  function progSpan(t) {
    const arr = arrivalAt(outLeg(t)), b = backLeg(t);
    return { start: arr.slice(0, 10), end: stayDates(t).checkout, arrivalTime: arr.slice(11, 16), departureTime: b && b.hasTime ? b.dep.slice(11, 16) : null };
  }
  /** Program jednoho místa, jen když platí pro současný příjezd a odjezd (jinak ho krok Program sestaví znovu). */
  function tripPlan(t) {
    const p = t.plan;
    if (!p || !Array.isArray(p.days)) return null;
    const w = progSpan(t), s = p.span;
    return (s ? spanOk(s, w) : p.days.every(d => d.date >= w.start && d.date <= w.end)) ? p : null;
  }
  /** Příjezd a odjezd cesty (den i čas) – po jejich změně neplatí program ani časy auta. */
  const tripTimes = t => { const b = backLeg(t); return JSON.stringify([stayDates(t), arrivalAt(outLeg(t)), b && b.hasTime ? String(b.dep).slice(0, 16) : null]); };
  /** Po změně spoje s jiným příjezdem nebo odjezdem: program znovu (místa trasy hlídá basePlan), auto s časy podle
   *  starého spoje pryč. Vrací true, když se zahodilo auto. */
  function retime(t, times) {
    if (tripTimes(t) === times) return false;
    t.plan = null;
    if (!t.car || t.car.mode === 'skip') return false;
    t.car = null;
    return true;
  }
  /** Ubytování v jednom místě bez vlastního odkazu (zadaná cena): hledání na Bookingu pro cíl a termín cesty – načtené
   *  nabídky kroku Ubytování po znovuotevření aplikace nebo ve sdílené cestě nejsou. */
  const stayFallbackUrl = t => { const d = stayDates(t); return d.nights >= 1 ? bookingSearch([t.dest.label, t.dest.country].filter(Boolean).join(', '), d.checkin, d.checkout, t.adults) : null; };
  // Rezervace ubytování místa trasy patří k místu a termínu (ne k pořadí v trase).
  const stayBookId = (b, d) => `stay:${b.id}:${d.checkin}:${d.checkout}`;

  // „doprava na letiště a zpět“ / „autem na letiště a zpět“ / „elektroautem …“ (velké = na začátku řádku souhrnu)
  function groundWhat(t, cap = false) {
    const w = `${t.groundMode !== 'car' ? 'doprava' : t.carFuel === 'ev' ? 'elektroautem' : 'autem'} na letiště${t.flight && t.flight.back ? ' a zpět' : ''}`;
    return cap ? w[0].toUpperCase() + w.slice(1) : w;
  }
  // Čím auto jezdí (z hledání): nafta / benzín / nabíjení; starší cesty a odkazy bez pohonu = palivo.
  const CAR_FUEL_TXT = { diesel: 'nafta', petrol: 'benzín', ev: 'nabíjení' };
  const carFuelOk = v => ['diesel', 'petrol', 'ev'].includes(v);
  const carFuelTxt = t => (carFuelOk(t.carFuel) ? CAR_FUEL_TXT[t.carFuel] : 'palivo');
  /**
   * Doprava na letiště v souhrnu a průběhu cesty (čistý text): { icon, row, out, back } – řádek ceny „Autem na letiště
   * a zpět (nafta, parkování, odhad)“ a cesta tam / zpět „Autem na letiště PRG (nafta, ~45 min, odhad)“ (elektroauto
   * „Elektroautem …“); out / back null, když cestu na letiště neznáme.
   */
  function groundLines(t) {
    const car = t.groundMode === 'car', ev = car && t.carFuel === 'ev', f = t.flight, g = t.ground || {};
    const gw = !car ? 'Cesta' : ev ? 'Elektroautem' : 'Autem', gf = car && !ev ? `${carFuelTxt(t)}, ` : '';
    // 🏠 vlastní cena na letiště (veřejnou dopravou) místo odhadu – u jednoho směru „vlastní cena a odhad“
    const legs = car ? [] : [g.out, f.back ? g.back : null].filter(Boolean), own = legs.filter(x => x.own === true).length;
    return {
      icon: car ? '🚗' : '🚆',
      row: `${groundWhat(t, true)} (${car ? `${carFuelTxt(t)}, parkování, ` : ''}${own ? (own === legs.length ? 'vlastní cena' : 'vlastní cena a odhad') : 'odhad'})`,
      out: g.out ? `${gw} na letiště ${f.out.from} (${gf}~${minutesToHm(g.out.minutes)}, odhad)` : null,
      back: f.back && g.back ? `${gw} z letiště ${f.back.to} domů (${gf}~${minutesToHm(g.back.minutes)})` : null,
    };
  }

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
    const arrival = ov ? 0 : Math.round(arrivalCzk(t) * pax);
    const transfers = transferCzk(t, pax);
    const total = flights + bags + ground + arrival + overland + stay + car + transfers;
    return { flights, bags, ground, arrival, overland, stay, car, transfers, total, perPerson: Math.round(total / pax) };
  }
  /**
   * Přejezdy na trase přes víc míst (odhad ze serveru u každého přejezdu): autem palivo za auto i z letiště na 1. místo
   * a z posledního zpět, vlakem / busem jízdenky mezi místy na osobu (z a na letiště je v dopravě z letiště).
   */
  function transferCzk(t, pax = t.adults) {
    if (!isMulti(t)) return 0;
    // trasa podle letů: jen jízdenky z místa na letiště jiného města (Řím → letiště Neapol)
    if (isFly(t)) return Math.round(t.route.bases.reduce((s, b, i) => { const x = gapLeg(t, gapAt(t, i)); return s + ((x && x.fareCzk) || 0); }, 0) * pax);
    const r = t.route, xs = r.transfers || [], ov = ovOn(t);
    const ends = ov ? overlandLegs(t) : r.legs || {};
    if (r.transport === 'transit') {
      // i cesta z letiště (města příjezdu vlakem) na 1. místo a zpět – pokud ji nepokrývá doprava z letiště do města
      const fare = x => (x && x.fareCzk) || 0;
      const sum = xs.reduce((s, x) => s + fare(x), 0) + (arrCovers(t, 'out') ? 0 : fare(ends.arrival)) + (arrCovers(t, 'back') ? 0 : fare(ends.departure));
      return Math.round(sum * pax);
    }
    // autem z letiště a na letiště jen s autem vyzvednutým / vráceným na letišti (jinak ten úsek kryje doprava z letiště);
    // po příjezdu vlakem/busem se doprava z letiště nepočítá – oba konce palivem
    // za auto palivo a na delším přejezdu v Itálii, Francii a Chorvatsku mýtné (tollCzk ze serveru)
    const carCost = x => (x ? (x.fuelCzk || 0) + (x.tollCzk || 0) : 0);
    const endFuel = (x, side) => (x && x.fuelCzk && (ov || carCovers(t, side)) ? carCost(x) : 0);
    return Math.round(xs.reduce((s, x) => s + carCost(x), 0) + endFuel(ends.arrival, 'out') + endFuel(ends.departure, 'back'));
  }

  /* ---------- cesta z letiště do města (z hledání: res.arrivals, v ceně letu flight.arrCzk) ---------- */
  /** Z výsledku hledání: cesta z letiště příletu do města a z města na letiště odletu (popisky, rozpis ceny). */
  const arrivalOf = (arr, f) => (arr ? {
    out: arr[f.out.to] || null, back: f.back ? arr[f.back.from] || null : null,
    // cesta přes víc měst: z města na letiště a z letiště do dalšího města u letů mezi místy
    ...(Array.isArray(f.mid) && f.mid.length ? { mid: f.mid.map(l => ({ from: arr[l.from] || null, to: arr[l.to] || null })) } : {}),
  } : null);
  /** Úsek cesty do města, který nahradí půjčené auto (vyzvednutí na letišti příletu, vrácení na letišti odletu). */
  const carCovers = (t, side) => { const c = t.car && t.car.mode !== 'skip' ? t.car : null, f = t.flight; return Boolean(c) && (side === 'out' ? c.pickup === f.out.to : Boolean(f.back) && c.dropoff === f.back.from); };
  /** Trasa přes víc míst: 1. (side 'out') / poslední místo je ve městě letiště (do 25 km) – přejezd k letišti kryje doprava z letiště do města. */
  const arrCovers = (t, side) => {
    const a = !ovOn(t) && +t.flight.arrCzk > 0 && t.arrival && t.arrival[side], bs = t.route.bases, base = side === 'out' ? bs[0] : bs[bs.length - 1];
    return Boolean(a && Number.isFinite(a.lat) && base && distKm(base, a) <= 25);
  };
  /** Úsek cesty z letiště do města, který odpadá: nahradí ho půjčené auto, nebo (trasa vlakem / busem) jízdenka
   *  z letiště na 1. / z posledního místa mimo město letiště, která je v přejezdech trasy. */
  const arrivalDrop = (t, side) => carCovers(t, side) || (isMulti(t) && t.route.transport === 'transit' && !arrCovers(t, side)
    && ((t.route.legs || {})[side === 'out' ? 'arrival' : 'departure'] || {}).fareCzk > 0);
  /**
   * Cesta z letiště do města a zpět, Kč/os. – jen byla-li v hledání (odhad „z letiště do města“, v ceně letenky není); úsek,
   * který nahradí půjčené auto nebo jízdenka na trase, odpadá (starší cesta bez rozpisu po směrech: celá).
   */
  function arrivalBase(t) {
    const all = +t.flight.arrCzk || 0, a = t.arrival || {};
    if (!all || (!a.out && !a.back)) return all;
    return Math.max(0, all - (arrivalDrop(t, 'out') && a.out ? a.out.czk : 0) - (arrivalDrop(t, 'back') && a.back ? a.back.czk : 0));
  }
  /** Totéž a úseky v noci k letišti s pevnou cenou taxi taxíkem místo MHD (nightTaxis). */
  function arrivalCzk(t) {
    return Math.max(0, arrivalBase(t) + nightTaxis(t).reduce((s, x) => s + taxiPp(x.a, t.adults) - (x.a.czk || 0), 0));
  }

  /* ---------- v noci taxi s pevnou cenou (data/arrival.json → taxi, ze serveru a.taxi) ---------- */
  // Vyráží-li se z ubytování na letiště nebo přistává-li se před 5:00 či od 23:00, MHD a letištní vlaky obvykle nejezdí.
  // U letišť s úřední pevnou cenou taxi za auto (Řím, Paříž, Madrid, Atény…) se ten úsek v odhadu ceny počítá taxíkem:
  // cena za auto (noční, je-li; u rozpětí podle části města horní – taxi.czk ze serveru) děleno dospělými, nad pax osob
  // další auto. Jen v průvodci, kde jsou časy známé – výsledky hledání dál počítají MHD.
  const nightHm = hm => typeof hm === 'string' && /^\d\d:\d\d$/.test(hm) && (hm < '05:00' || hm >= '23:00');
  const taxiOk = a => Boolean(a && a.mode !== 'taxi' && a.taxi && a.taxi.czk > 0);
  /** Taxi na osobu v Kč: auto děleno dospělými, nad pax osob (4) další auto. */
  const taxiPp = (a, adults) => { const n = Math.max(1, adults || 1), pax = a.taxi.pax > 0 ? a.taxi.pax : 4; return (Math.ceil(n / pax) * a.taxi.czk) / n; };
  /**
   * Úseky cesty mezi letištěm a městem v noci k letišti s pevnou cenou taxi, které jsou v odhadu ceny: [{ a, key }] –
   * key 'out' (přílet), 'back' (z ubytování na let zpět), 'from<i>' / 'to<i>' (lety mezi místy). Ne úsek, který nahradí
   * auto nebo přejezd trasy (trasa po zemi: jen veřejnou dopravou do města letiště), ne bez cesty do města v ceně.
   */
  function nightTaxis(t) {
    const f = t.flight, a = t.arrival, xs = [];
    if (!a || ovOn(t) || !(+f.arrCzk > 0)) return xs;
    const multi = isMulti(t), fly = isFly(t);
    let lb0 = null; const lb = () => (lb0 ||= leaveBy(t)); // jen když je co počítat
    const counted = side => !arrivalDrop(t, side) && (!multi || fly || (t.route.transport === 'transit' && arrCovers(t, side)));
    if (taxiOk(a.out) && counted('out') && f.out.hasTime && nightHm(arrivalAt(f.out).slice(11, 16))) xs.push({ a: a.out, key: 'out' });
    const lg = fly ? gapLeg(t, gapAt(t, t.route.bases.length - 1)) : null;
    if (taxiOk(a.back) && f.back && counted('back') && !lg && lb().hotel && nightHm(lb().hotel.hm)) xs.push({ a: a.back, key: 'back' });
    if (fly) midLegs(t).forEach((l, i) => {
      const am = (Array.isArray(a.mid) && a.mid[i]) || {}, lx = taxiOk(am.from) && lb().mids && lb().mids[i];
      if (lx && !gapLeg(t, gapAt(t, i)) && nightHm(lx.hm)) xs.push({ a: am.from, key: `from${i}` });
      if (taxiOk(am.to) && l.hasTime && nightHm(arrivalAt(l).slice(11, 16))) xs.push({ a: am.to, key: `to${i}` });
    });
    return xs;
  }
  const CUR_SIGN = { EUR: '€', USD: '$', GBP: '£' };
  const curNum = n => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ','));
  /** Pevná cena taxi za auto: „55 €“, v noci noční „65 €“, podle části města „56–65 €“. */
  function taxiPrice(x) {
    const sign = CUR_SIGN[x.cur] || x.cur;
    return x.night > 0 ? `${curNum(x.night)} ${sign}` : x.hi > x.fare ? `${curNum(x.fare)}–${curNum(x.hi)} ${sign}` : `${curNum(x.fare)} ${sign}`;
  }
  /** „ · v noci taxi, pevná cena 55 € za auto (v odhadu ceny započteno)“ k řádku cesty v průběhu cesty. */
  function taxiTxt(a) {
    const x = a.taxi, range = !(x.night > 0) && x.hi > x.fare;
    return ` · v noci taxi, pevná ${x.night > 0 ? 'noční ' : ''}cena ${taxiPrice(x)} za auto${range ? ' podle části města' : ''} (v odhadu ceny započteno${range ? ` ${taxiPrice({ ...x, fare: x.hi, hi: 0 })}` : ''})`;
  }
  /** „taxi na letiště FCO (noc) 55 € za auto“ – úseky v noci taxíkem k řádku ceny. */
  const taxiWhat = xs => xs.map(x => `taxi ${/^(out|to)/.test(x.key) ? 'z letiště' : 'na letiště'} ${x.a.iata} (noc) ${taxiPrice(x.a.taxi)} za auto`).join(', ');
  /** Popisek ceny cesty z letiště do města podle směrů, které se počítají. */
  function arrivalWhat(t) {
    const a = t.arrival || {}, out = !(a.out && arrivalDrop(t, 'out')), back = Boolean(t.flight.back) && !(a.back && arrivalDrop(t, 'back'));
    return out ? `z letiště do města${back ? ' a zpět' : ''}` : 'z města na letiště';
  }
  /** Čím: z letiště „metro 14 do Châtelet“, na letiště jen „metro 14“ (SearchHelp.arrivalVia). */
  const arrivalHow = (a, back) => (back && window.SearchHelp ? SearchHelp.arrivalVia(a.how) : a.how);
  /** „Z letiště BVA → Paříž · autobus Aérobus do Paris Porte Maillot · ~1 h 15 min · 17,90 € (~440 Kč)/os.“ (čistý text). */
  function arrivalRow(a, back) {
    const fare = window.SearchHelp ? SearchHelp.arrivalFare(a) : `~${czk(a.czk)}`;
    return `${back ? `${a.city} → letiště ${a.iata}` : `Z letiště ${a.iata} → ${a.city}`} · ${arrivalHow(a, back)} · ~${minutesToHm(a.min)} · ${fare}/os.${a.basis !== 'table' ? ' (odhad)' : ''}`;
  }
  const ARR_ICO = { bus: '🚌', train: '🚆', metro: '🚇', tram: '🚊', taxi: '🚕' };
  /**
   * Jízdné k přejezdu letiště ↔ 1. / poslední místo trasy: jen veřejnou dopravou a když je to místo ve městě letiště
   * (do 25 km od jeho středu) – „ · letištní bus 17,90 € (~440 Kč)/os.“; jinak '' (jízdné do jiného místa neznám).
   */
  function arrivalFareTxt(t, side, base, tr) {
    const a = t.arrival && t.arrival[side];
    if (tr !== 'transit' || !a || !Number.isFinite(a.lat) || !base || distKm(base, a) > 25) return '';
    return ` · ${arrivalHow(a, side === 'back')} ${window.SearchHelp ? SearchHelp.arrivalFare(a) : `~${czk(a.czk)}`}/os.${a.basis !== 'table' ? ' (odhad)' : ''}`;
  }

  /** Země cesty pro vstupní podmínky: cíl, místa trasy a země z cesty přes víc měst (bez Česka). */
  function tripCountries(t) {
    const list = [t.dest && t.dest.cc, ...(isMulti(t) ? t.route.bases.map(b => b.cc) : []), ...(Array.isArray(t.ccs) ? t.ccs : [])];
    return [...new Set(list.filter(cc => /^[A-Z]{2}$/.test(cc || '') && cc !== 'CZ'))];
  }
  /** Země přestupů (let tam i zpět), kde registrace platí i pro tranzit – ESTA při přestupu v USA apod. */
  const tripVia = t => (!ovOn(t) && window.Entry && Entry.ready() ? Entry.transitCcs(allLegs(t), tripCountries(t)) : []);
  /** Datum návratu: let zpět, jinak konec pobytu (cesta jen tam). */
  const returnDate = t => (backLeg(t) ? backLeg(t).date : stayDates(t).checkout);

  /** Co je na cestě v průvodci rozpracované (trasa, ubytování, auto, program, odškrtnuté rezervace) – pro otázku před nahrazením. */
  const progressOf = mine => [isMulti(mine) && 'trasu', (mine.stay || (isMulti(mine) && mine.route.bases.some(b => b.stay))) && 'ubytování', mine.car && 'auto',
    (mine.plan || (isMulti(mine) && mine.route.bases.some(b => b.plan))) && 'program',
    mine.booked && Object.values(mine.booked).some(Boolean) && 'odškrtnuté rezervace'].filter(Boolean);
  /** Otisk cesty pro sdílený odkaz: spoje, termín, lidé, ubytování, auto a trasa – stejný = tatáž cesta (vlastní odkaz). */
  const tripSig = x => JSON.stringify([
    [x.flight.out, ...midLegs(x), x.flight.back].map(l => (l ? [l.from, l.to, l.date, String(l.dep || '').slice(0, 16)] : null)),
    ovOn(x) ? [x.overland.out, x.overland.back].map(g => (g ? [g.date, String(g.dep || '').slice(0, 16)] : null)) : null,
    stayDates(x), +x.adults, x.bags || 'none',
    [x.stay, x.car].map(s => (s ? [s.mode, s.id || s.name || '', Math.round(s.totalCzk || 0)] : null)),
    isMulti(x) ? x.route.bases.map(b => [b.id, b.nights, b.stay ? [b.stay.mode, b.stay.id || b.stay.name || ''] : null]) : null,
  ]);
  /**
   * Obsah sdílené cesty k porovnání: klíče podle abecedy, bez odškrtnutí „Co zařídit a co sbalit“ (ta se jen přidávají –
   * PreTrip.adopt) a bez času ceny letu (tentýž let vybraný znovu z novějšího hledání je pořád tatáž cesta).
   */
  const linkSig = x => {
    const { done, ...p } = x.pretrip || {};
    return JSON.stringify({ ...x, flight: x.flight && { ...x.flight, pricedAt: undefined }, pretrip: Object.keys(p).length ? p : undefined }, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(n => [n, v[n]])) : v));
  };

  /* ---------- start z výsledků hledání ---------- */
  // Cena z paměti tras (Wizz Air: leg.memAgeMin, u výsledku štítek „⏱ cena před 5 h“) je o tolik starší než výsledek
  // hledání – v ms, nejstarší z letu tam a zpět (jako memAge ve flights.js); čerstvá cena 0.
  const memAgeMs = t => Math.max(0, ...[t.out, t.back].map(l => +(l && l.memAgeMin)).filter(Number.isFinite)) * 6e4;
  // at = čas cen výsledku, ze kterého let je (flight.pricedAt – „cena z 3. 10. 14:12“ v kroku Let a ve Shrnutí);
  // cena z paměti tras o její stáří dřív
  // stops = cíle letů cesty přes víc měst (t.mid = lety mezi nimi): trasa podle letů (flyBases)
  function start({ t, g, result, ccs = null, at = 0, stops = null }) {
    const originsBy = Object.fromEntries((result.origins || []).map(o => [o.iata, o]));
    const dest = g ? g.dest : { label: t.out.to, cc: '', country: '', lat: null, lon: null };
    const mem = memAgeMs(t);
    // Rozpracovaná cesta (vybraná trasa, ubytování, auto, program nebo odškrtnuté rezervace) se nezahodí bez zeptání –
    // „↩ Vybrat jiný let“ i nový výběr z výsledků by ji jinak potichu přepsaly.
    const mine = S.trip;
    // stejný let tam i zpět znovu (z výsledků, z uložených výsledků) pro stejně lidí a zavazadla → pokračovat v rozpracované
    // cestě; za stejnou cenu z novějšího hledání platí cena k jeho času
    if (mine && mine.flight && JSON.stringify([mine.flight.out, midLegs(mine), mine.flight.back || null]) === JSON.stringify([t.out, Array.isArray(t.mid) ? t.mid : [], t.back || null])
      && +mine.adults === +result.query.adults && (mine.bags || 'none') === (result.query.bags || 'none')) {
      if (at > 0 && at - mem > (mine.flight.pricedAt || 0) && at <= Date.now() && mine.flight.flightCzk === t.flightCzk) { mine.flight.pricedAt = at - mem; persist(); }
      go('trip'); return;
    }
    if (mine && mine.flight) {
      const done = progressOf(mine);
      if (done.length && !confirm(`Máš rozpracovanou cestu: ${mine.dest?.label || mine.flight.out.to} (${done.join(', ')}). Nahradit ji novou cestou s tímto letem?`)) return;
    }
    // Let z průběžných výsledků (pomalejší zdroje ještě hledaly): statistika cen i úroveň ceny letu jsou jen z části
    // zdrojů – neuložit, doplní je konečný výsledek téhož hledání (finalStats, statsWait = jeho dotaz). Statistika
    // průběžného výsledku čeká stranou (statsPreview) pro případ, že hledání konečný výsledek nepřinese (statsGiveUp).
    const part = Boolean(result.partial), created = Date.now();
    const fly = Array.isArray(t.mid) && t.mid.length ? flyBases(t, stops, 3) : null;
    S.trip = {
      v: 1,
      created,
      adults: result.query.adults,
      bags: result.query.bags || 'none',
      // kopie nabídky z výpisu (pricedAt nepatří do výsledků hledání); bez času výsledku od teď
      flight: { ...t, ...(part ? { priceLevel: undefined } : {}), pricedAt: (at > 0 && at <= created ? at : created) - mem },
      // „Je to dobrá cena?“ v kroku Let: ceny letenek z hledání, ze kterého let je (bez paměti tras – ta je v prohlížeči)
      priceStats: part ? null : statsFrom(g, result),
      ...(part ? { statsWait: JSON.stringify(result.query), statsPreview: statsFrom(g, result) } : {}),
      dest: { label: dest.label, country: dest.country, cc: dest.cc, lat: dest.lat, lon: dest.lon, id: dest.id },
      home: result.home ? result.home.label : null,
      // Cíl v dosahu vlaku/busu (odhad z hledání) → v kroku Let nabídka „Pojedu vlakem / busem“.
      groundRef: g && g.ground ? { ...g.ground } : null,
      overland: null,
      // cesta přes víc měst: všechny země na cestě (vstupní podmínky), jen kódy
      ...(Array.isArray(ccs) && ccs.length ? { ccs: ccs.slice(0, 8) } : {}),
      ground: {
        out: originsBy[t.out.from]?.ground || null,
        back: t.back ? (originsBy[t.back.to]?.ground || null) : null,
      },
      // cesta z letiště příletu do města a z města na letiště odletu (jízdné z ověřené tabulky, jinak odhad)
      arrival: arrivalOf(result.arrivals, t),
      // doprava na letiště z hledání: veřejnou dopravou, nebo autem (palivo + parkování) a čím auto jezdí – jen pro popisky
      groundMode: result.query && result.query.groundMode === 'car' ? 'car' : 'transit',
      carFuel: result.query && result.query.groundMode === 'car' && carFuelOk(result.query.carFuel) ? result.query.carFuel : null,
      nightsOneWay: 3,
      stay: null,
      car: null,
      plan: null,
      // cesta přes víc měst: místa a noci podle letů, mezi místy se letí (přejezdy po zemi nejsou)
      ...(fly ? { route: { mode: 'multi', fixed: 'flights', transport: 'transit', bases: fly, transfers: [], legs: {}, exclude: [], candidates: [], notes: [] } } : {}),
      booked: {},
      // Nejdřív shrnutí letu s živým ověřením ceny (Kiwi.com), pak ubytování.
      step: 'flight',
    };
    staysData = null; carsData = null;
    persist();
    go('trip');
  }
  // statistika cen cíle (skupiny), u konkrétního cíle celé trasy – bez nejlevnějších po trasách (mins, paměť cen)
  const statsFrom = (g, res) => { const st = (g && g.priceStats) || res.priceStats; return st ? { ...st, mins: undefined } : null; };
  /**
   * Konečný výsledek hledání (volá flights.js): cesta vybraná z jeho průběžných výsledků (statsWait = dotaz hledání) dostane
   * statistiku cen cíle a úroveň ceny letu z něj (let v něm není → úroveň se dopočítá ze statistiky). Totéž, když hledání
   * dřív skončilo bez něj (statsPart = jeho dotaz) a teď doběhlo znovu. → true = doplněno.
   */
  function finalStats(res) {
    const t = S.trip, wait = t && (t.statsWait || t.statsPart);
    if (typeof wait !== 'string' || !res || res.partial || !res.query || JSON.stringify(res.query) !== wait) return false;
    const f = t.flight, g = f.destKey ? (res.groups || []).find(x => x.dest.key === f.destKey) : null;
    t.priceStats = statsFrom(g, res);
    const same = f.id ? [...(res.top || []), ...(res.groups || []).flatMap(x => x.options || [])].find(x => x.id === f.id) : null;
    if (same && same.priceLevel) f.priceLevel = { ...same.priceLevel };
    delete t.statsWait; delete t.statsPreview; delete t.statsPart;
    persist();
    showPriceRow(t); // krok Let na obrazovce: štítek hned
    return true;
  }
  // Na konečný výsledek už se nečeká: statistika z průběžného výsledku, ze kterého je let, s poznámkou (statsPart).
  function giveUpStats(t) {
    if (t.statsWait) {
      if (!t.priceStats && t.statsPreview) t.priceStats = t.statsPreview;
      t.statsPart = t.statsWait;
    }
    delete t.statsWait; delete t.statsPreview;
  }
  /**
   * Hledání, ze kterého je let vybraný z průběžných výsledků, skončilo bez konečného výsledku (zrušilo ho jiné hledání,
   * selhalo – volá flights.js s jeho dotazem): „Je to dobrá cena?“ aspoň z průběžného výsledku, ne nikdy. → true = vzdáno.
   */
  function statsGiveUp(query) {
    const t = S.trip;
    if (!t || !t.statsWait || query !== t.statsWait) return false;
    giveUpStats(t);
    persist();
    showPriceRow(t);
    return true;
  }
  function showPriceRow(t) { const el = $('#tfPl'); if (el) { el.innerHTML = priceRow(t); wirePrice(t); } }

  function setStep(step) {
    if (!T()) return;
    T().step = step; persist(); render(); window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- vykreslení ---------- */
  function render() {
    const root = $('#tripRoot'); if (!root) return;
    const t = T();
    if (!t) {
      // úvod jako cestovní aplikace: fotka, co průvodce umí po krocích, dvě tlačítka
      root.innerHTML = `<div class="trip-intro">
        <div class="card dest trip-hero" data-photo="Amalfi" style="--h:200"><div class="flag">🧳</div><div class="dest-panel"><div class="cname">Sestav si celou cestu</div>
          <div class="cblurb">Let, ubytování, auto i program na místě – a celková cena na jednom místě.</div></div></div>
        <form class="card trip-ask" id="tripAsk"><label class="trip-ask-l">Kam chceš jet?</label>
          <div class="trip-ask-row"><div class="place-input" id="tripAskTo"></div><button class="btn primary" type="submit">Najít lety</button></div>
          <small class="faint">Město, „kamkoliv“, nebo celá věta – „Řím na víkend ve dvou“. Z nabídek pak vybereš let a průvodce pokračuje.</small></form>
        <div class="trip-intro-act"><button type="button" class="btn ghost" id="tripGoExplore">🗺️ Jen objevovat místa</button></div>
        <div class="trip-steps-h">Jak to funguje</div>
        <ol class="trip-steps">
          <li><span>✈️</span><div><b>Let</b><small>Napiš výš, kam chceš (nebo hledej v Letech či radaru), a u nabídky klikni na <b>Vybrat a pokračovat</b>.</small></div></li>
          <li><span>🏨</span><div><b>Ubytování</b><small>Hotely s cenou na tvoje dny a odkazy na Booking, Airbnb a další.</small></div></li>
          <li><span>🚗</span><div><b>Auto</b><small>Půjčení auta na místě – nebo jen veřejná doprava.</small></div></li>
          <li><span>🗺️</span><div><b>Program</b><small>Co vidět den po dni, výlety, kolo i pěšky.</small></div></li>
          <li><span>✅</span><div><b>Shrnutí</b><small>Celková cena, uložení do Plánovače a kalendáře.</small></div></li>
        </ol></div>`;
      $('#tripGoExplore').onclick = () => go('explore');
      // Kam chceš jet? – rovnou hledání letů (věta jako ✨ v Letech, odkud domov / minulé hledání)
      const F = window.Flights;
      if (F && F.PlaceInput) {
        const home = () => (S.home && S.home.from) || [];
        const pi = new F.PlaceInput($('#tripAskTo'), { placeholder: 'např. Lisabon, kamkoliv 🌍…', max: 4,
          smart: F.smartRun ? { run: hit => F.smartRun(hit, home()), tips: () => (F.smartTips ? F.smartTips(home) : []) } : null });
        $('#tripAsk').onsubmit = async e => {
          e.preventDefault();
          const r = await pi.settle();
          if (r === 'run' || r === false) return;
          F.searchTo(pi.items);
        };
      } else $('#tripAsk').hidden = true;
      if (window.Photos) Photos.paint(root);
      return;
    }
    const idx = STEPS.findIndex(s => s[0] === t.step);
    root.innerHTML = `
      <div class="trip-head card" data-photo="${esc(t.dest.label)}" style="--h:${window.ccHue ? ccHue(t.dest.cc) : 210}">
        <span class="th-flag">${flag(t.dest.cc)}</span>
        <button type="button" class="th-reset" id="tripRestart" title="Zahodit tuhle cestu a začít znovu výběrem letu" aria-label="Začít znovu">↺<span class="th-rl"> Začít znovu</span></button>
        <div class="th-total" id="thTotal">${headTotal(t)}</div>
        <div class="th-dest"><h2>${esc(tripName(t))}</h2><div class="th-sub" id="thSub">${headSub(t)}</div></div>
      </div>
      <div class="stepbar">${STEPS.map((s, i) => `${i ? `<i${i <= idx ? ' class="done"' : ''}></i>` : ''}<button type="button" class="st ${i < idx ? 'done' : ''} ${i === idx ? 'on' : ''}" data-step="${s[0]}" title="${s[2]}" ${s[0] === 'flight' ? 'data-flight="1"' : ''}><span>${i < idx ? '✓' : s[1]}</span>${s[2]}</button>`).join('')}</div>
      <div id="tripStep"></div>`;
    if (window.Photos) Photos.paint(root); // fotka cíle v hlavičce
    $$('.stepbar [data-step]').forEach(b => b.onclick = () => setStep(b.dataset.step));
    $('#tripRestart').onclick = () => restart();
    if (t.step === 'flight') flightStep();
    else if (t.step === 'route') routeStep();
    else if (t.step === 'stay') stayStep();
    else if (t.step === 'car') carStep();
    else if (t.step === 'program') programStep();
    else summaryStep();
    tabIntoView();
  }
  /** Záložky míst trasy (Ubytování, Program) se na telefonu nevejdou: vybrané místo posunout doprostřed lišty. */
  function tabIntoView() {
    const on = $('#tripStep .base-tabs .bt.on'), bar = on && on.parentElement;
    if (!bar || !on.getBoundingClientRect || bar.scrollWidth <= bar.clientWidth) return;
    bar.scrollLeft += on.getBoundingClientRect().left - bar.getBoundingClientRect().left - (bar.clientWidth - on.offsetWidth) / 2;
  }

  /** ↺ Začít znovu: rozpracovanou cestu zahodit (po potvrzení, když v ní něco je) a vybrat let znovu. Uložená kopie
   *  v plánovači zůstane. */
  function restart() {
    const t = T();
    if (!t) return;
    // bez rozpracovaného (jen vybraný let) bez ptaní
    const done = progressOf(t), saved = Array.isArray(S.trips) && S.trips.some(x => x && x.tripId && x.tripId === t.created);
    if (done.length && !confirm(`Zahodit rozpracovanou cestu ${t.dest?.label || t.flight.out.to} (${done.join(', ')}) a začít znovu?${saved ? ' Kopie v plánovači zůstane.' : ''}`)) return;
    S.trip = null; staysData = null; carsData = null;
    persist();
    toast('Cesta zahozena – vyber nový let');
    go('flights');
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

  // Přestupy letu jako ve výsledcích („1× přestup (FRA 1 h 35 min)“) – ať je vidět i země „jen přestup“ z 🛂 Před cestou.
  const stopsTxt = l => (l.stops > 0 ? `${l.stops}× přestup${(l.layovers || []).length ? ` (${l.layovers.map(x => `${x.at || ''} ${x.min > 0 ? minutesToHm(x.min) : ''}`.trim()).join(', ')})` : ''}` : '');
  // let jako v jízdence: den, velké časy s letišti a čára mezi nimi, pod tím aerolinka a přestupy
  function legLine(l, back, label = '') {
    const meta = [l.carrierName, l.flightNo, l.stops > 0 ? stopsTxt(l) : l.stops === 0 ? 'přímý' : ''].filter(Boolean).join(' · ');
    return `<div class="tl-leg"><span class="cbadge" style="background:#5b8cff">${esc(l.carrier || '✈')}</span>
      <div class="tl-main"><div class="tl-day">${label || (back ? '↩ Zpět' : 'Tam')} · ${dayLbl(l.date)}</div>
        <div class="tl-route"><span><b>${depHm(l) || '–'}</b><small>${esc(l.from)}</small></span><i class="tl-line" aria-hidden="true"></i><span><b>${arrHm(l) || '–'}</b><small>${esc(l.to)}</small></span></div>
        ${meta ? `<div class="tl-meta">${esc(meta)}</div>` : ''}${depHm(l) ? '' : '<div class="tl-meta">čas odletu ověř u aerolinky</div>'}</div></div>`;
  }

  // „Je to dobrá cena?“ u vybraného letu: úroveň ceny ze serveru, u živé nabídky (Ověřit) dopočítaná ze statistiky hledání;
  // let z průběžných výsledků až s konečným výsledkem hledání (statsWait, finalStats); hledání bez něj skončilo
  // (statsPart) → z průběžného výsledku a s poznámkou
  function priceRow(t) {
    const pl = !t.statsWait && window.PriceCheck && window.Flights && Flights.priceTag ? PriceCheck.assess(t.flight, t.priceStats || null) : null;
    return pl ? `<div class="tf-price">${Flights.priceTag(t.flight, null, pl)}<span class="faint">${esc(pl.reason)}${t.statsPart ? ' · podle průběžných výsledků, hledání nedoběhlo' : ''}</span><button type="button" class="linkbtn" id="tfPrice">Je to dobrá cena?</button></div>` : '';
  }
  function wirePrice(t) {
    const pb = $('#tfPrice'); if (pb) pb.onclick = () => Flights.priceCheck(t.flight, { stats: t.priceStats || null, label: t.dest.label, inResults: false });
  }
  // Kdy byla cena letu (pricedAt: výsledek hledání, „Použít“ u živé nabídky): „cena z 3. 10. 14:12 (před 8 dny)“ pod cenou
  // letenek v kroku Let a ve Shrnutí; starší cesty čas nemají → nic. Starší než den u nezakoupeného letu, který ještě
  // neodletěl, + „↻ Ověř cenu“ = ruční ověření (Kiwi.com), samo se nic neověřuje a cena letu se nepřepíše.
  const flightBooked = t => Object.keys(t.booked || {}).some(k => /^flight\d+$/.test(k) && t.booked[k] === true);
  function priceAgeHtml(t, id) {
    const a = !ovOn(t) && t.flight.pricedAt && window.SearchHelp && SearchHelp.resultAge ? SearchHelp.resultAge(t.flight.pricedAt, Date.now()) : null;
    if (!a) return '';
    // živé ověření umí jen let tam a zpět – cesta přes víc měst letadlem ho nemá
    const re = a.min >= 1440 && !flightBooked(t) && t.flight.out.date >= fmtYMD(new Date()) && !isFly(t);
    // „(před 8 dny)“ se nerozdělí (úzký sloupec Shrnutí na telefonu)
    return `<div class="faint tf-age">cena ${a.z} ${esc(a.txt.replace(/\([^)]*\)$/, x => x.replace(/ /g, '\u00a0')))}${re ? ` · <button type="button" class="linkbtn" id="${id}">↻ Ověř cenu</button>` : ''}</div>`;
  }
  // „↻ Ověř cenu“ v kroku Let (ověří hned) a ve Shrnutí (krok Let a ověřit tam – jednou, i u cesty, která se ještě
  // neověřovala); výsledek ověření pak do obrazovky
  function wireAge() {
    const a = $('#tfAge'); if (a) a.onclick = () => verifyFlight({ show: true });
    const s = $('#sumAge'); if (s) s.onclick = () => { const t = T(); if (!t.verifiedAt) t.verifiedAt = Date.now(); t.step = 'flight'; persist(); render(); verifyFlight({ show: 'top' }); };
  }
  /**
   * Výsledek ověření (#tfAlt) je pod letem, tlačítky a cenou – na telefonu často pod spodní lištou, klepnutí by vypadalo,
   * že nic neudělalo: posunout ho do obrazovky (doprostřed, nabídky přibudou pod ním), když jeho začátek (řádek
   * „Ověřuji…“, nadpis a první nabídka) není vidět mezi lepivou hlavičkou a spodní lištou. top = krok Let právě otevřený
   * ze Shrnutí: je-li výsledek vidět od začátku kroku, jen nahoru jako při přepnutí kroku.
   */
  function altIntoView(top = false) {
    const el = $('#tfAlt');
    if (!el || !el.getBoundingClientRect) return;
    const nav = $('.mobile-nav'), head = $('.topbar');
    const end = nav && getComputedStyle(nav).display !== 'none' ? nav.getBoundingClientRect().top : innerHeight;
    const y = el.getBoundingClientRect().top + (top ? scrollY : 0);
    if (top && y + 200 <= end) window.scrollTo({ top: 0, behavior: 'smooth' });
    else if (y < (head ? head.getBoundingClientRect().bottom : 0) || y + 200 > end) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  /**
   * Průvodce zůstává otevřený (Android drží aplikaci, nákup za pár dní): „cena z …“ v kroku Let a ve Shrnutí znovu
   * s aktuálním „před …“ (a „ze včera“), po dni i s „↻ Ověř cenu“, u zakoupené letenky bez něj. Jen ten řádek – výsledek
   * ověření, rozepsané a posun stránky zůstanou. Volá flights.js při návratu do aplikace a každých 5 min, Shrnutí po
   * odškrtnutí letenky. → true = přepsáno.
   */
  function ageRefresh() {
    const t = T();
    if (!t || !t.flight || (t.step !== 'flight' && t.step !== 'summary') || !$('#view-trip.active')) return false;
    const el = $('#tripStep .tf-age');
    if (!el) return false;
    el.outerHTML = priceAgeHtml(t, t.step === 'flight' ? 'tfAge' : 'sumAge');
    wireAge();
    return true;
  }
  function flightStep() {
    const t = T();
    const host = $('#tripStep');
    $$('.stepbar .st').forEach(b => b.classList.toggle('on', b.dataset.step === 'flight'));
    if (ovOn(t)) return overlandStep();
    const arr = arrivalCzk(t); // úsek, který nahradí auto půjčené na letišti, se nepočítá (jako v souhrnu)
    const nt = nightTaxis(t), arrNote = [arrivalBase(t) < t.flight.arrCzk ? (carCovers(t, 'out') || carCovers(t, 'back') ? 'bez úseku autem' : 'bez úseku v přejezdech trasy') : '', nt.length ? esc(taxiWhat(nt)) : ''].filter(Boolean).join(' · ');
    // ceny na osobu po řádcích (letenky, zavazadla, cesta na letiště, z letiště do města)
    const cap = w => w[0].toUpperCase() + w.slice(1);
    const costRows = [['Letenky', czk(t.flight.flightCzk)],
      t.flight.bagCzk ? ['Zavazadla', `~${czk(t.flight.bagCzk)}`] : null,
      t.flight.groundCzk ? [groundWhat(t, true), czk(t.flight.groundCzk), t.groundMode === 'car' && carFuelOk(t.carFuel) && t.carFuel !== 'ev' ? carFuelTxt(t) : ''] : null,
      arr ? [cap(arrivalWhat(t)), `~${czk(arr)}`, arrNote] : null].filter(Boolean);
    // cesta přes víc měst: všechny lety (každý samostatná letenka); živé ověření umí jen let tam a zpět
    const fly = isFly(t), legs = allLegs(t);
    host.innerHTML = `<div class="card step-card tf-card"><h3>✈️ ${fly ? `Vybrané lety (${legs.length})` : 'Vybraný let'}</h3>
      <div class="tl-legs">${fly ? legs.map((l, i) => legLine(l, false, `${i + 1}. let`)).join('') : `${legLine(t.flight.out)}${t.flight.back ? legLine(t.flight.back, true) : ''}`}</div>
      ${fly ? `<div class="faint" style="font-size:12.5px;margin-top:6px">🎫 Každý let je samostatná letenka – při zpoždění jednoho letu další aerolinka nečeká. Mezi lety: ${esc(t.route.bases.map(b => b.name).join(' → '))}.</div>` : ''}
      <div class="tf-costs">${costRows.map(r => `<div><span>${r[0]}${r[2] ? `<small>${r[2]}</small>` : ''}</span><b>${r[1]}</b></div>`).join('')}<div class="tf-pp">ceny na osobu</div></div>
      ${priceAgeHtml(t, 'tfAge')}
      ${t.arrival && t.arrival.out ? `<div class="faint" style="font-size:12.5px;margin-top:4px">${ARR_ICO[t.arrival.out.mode] || '🚌'} ${esc(arrivalRow(t.arrival.out))}${t.arrival.back && t.arrival.back.iata !== t.arrival.out.iata ? `<br>${ARR_ICO[t.arrival.back.mode] || '🚌'} ${esc(arrivalRow(t.arrival.back, true))}` : ''}</div>` : ''}
      <div id="tfPl">${priceRow(t)}</div>
      <div class="step-act"><button class="btn primary" id="tfNext">Pokračovat: Trasa →</button><div class="step-act2"><button class="btn" id="tfBack">↩ Jiný let</button>${fly ? '' : '<button class="btn" id="tfVerify" title="Ověřit živou cenu a porovnat aerolinky">🔄 Ověřit živou cenu</button>'}</div></div>
      <div id="tfAlt"></div></div>${groundOffer(t)}`;
    $('#tfBack').onclick = () => go('flights');
    $('#tfNext').onclick = () => setStep('route');
    const vb = $('#tfVerify'); if (vb) vb.onclick = () => verifyFlight({ show: true });
    wireAge();
    wirePrice(t);
    const os = $('#ovStart'); if (os) os.onclick = () => overlandPicker(t);
    // Při prvním zobrazení vybraného letu ověř cenu automaticky (jednou za cestu).
    if (!t.verifiedAt && !fly) { t.verifiedAt = Date.now(); persist(); verifyFlight({ auto: true }); }
  }

  /**
   * Živé ceny všech aerolinek pro zvolená data a letiště (Kiwi.com). show = na klepnutí (ne samo při prvním otevření):
   * řádek „Ověřuji…“ a pak výsledek do obrazovky (altIntoView; 'top' = krok Let právě otevřený ze Shrnutí).
   */
  async function verifyFlight({ auto = false, show = false } = {}) {
    const t = T();
    const f = t.flight;
    const host = $('#tfAlt');
    host.innerHTML = '<div class="loading-row"><span class="spin dark"></span> Ověřuji aktuální ceny u všech aerolinek…</div>';
    if (show) altIntoView(show === 'top');
    try {
      const qs = new URLSearchParams({ from: f.out.from, to: f.out.to, out: f.out.date, adults: t.adults });
      if (t.bags && t.bags !== 'none') qs.set('bags', t.bags); // příplatek za zavazadla i u jiné nabídky
      if (f.back) { qs.set('back', f.back.date); qs.set('backFrom', f.back.from); qs.set('backTo', f.back.to); }
      const r = await fetch('api/verify?' + qs);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      if (!j.available) { host.innerHTML = auto ? '' : '<div class="note info" style="margin-top:12px">ℹ️ <div>Živé ověření není v tomto režimu dostupné.</div></div>'; return; }
      if (!j.items.length) { host.innerHTML = `<div class="note warn" style="margin-top:12px">⚠️ <div>Pro tato data jsem živé nabídky nenašel${j.error ? ` (${esc(j.error)})` : ''}. Cenu ověř přímo u aerolinky.</div></div>`; return; }
      const cur = f.flightCzk;
      const openJaw = f.back && (f.back.from !== f.out.to || f.back.to !== f.out.from);
      // Cena z mezipaměti (Aviasales, až 48 h stará), kterou živě nikdo nenabízí: upozornit nahoře i ve Shrnutí
      const cached = SearchHelp.isCached(f) || f.provider === 'travelpayouts' || f.out.provider === 'travelpayouts'; // i starší uložené cesty bez příznaku live
      // stejné pravidlo jako ve výpisu (SearchHelp.liveVerdict): o víc než 10 % dráž = cena z mezipaměti neplatí
      const v = SearchHelp.liveVerdict(cur, j.items);
      if (cached && (v.st === 'dearer' || f.liveMin)) { f.liveMin = v.st === 'dearer' ? v.min : null; f.liveAt = Date.now(); persist(); }
      const stale = cached && f.liveMin ? `<div class="note warn" style="margin-top:12px">⚠️ <div><b>Cena ${czk(cur)} je z mezipaměti</b> (Aviasales, může být až 2 dny stará) a živě ji teď nikdo nenabízí – nejlevnější živá nabídka na stejné dny je <b>${czk(f.liveMin)}</b>. Ověř ji před nákupem, nebo použij živou nabídku níž.</div></div>` : '';
      host.innerHTML = `${stale}<div class="divider"></div><div class="muted" style="font-size:13px;margin-bottom:8px">Živé nabídky pro ${dayLbl(f.out.date)}${f.back ? ` – ${dayLbl(f.back.date)}` : ''} (${esc(f.out.from)} → ${esc(f.out.to)}${openJaw ? `, zpět ${esc(f.back.from)} → ${esc(f.back.to)} – dvě samostatné letenky` : ''}), cena na osobu:</div>
        <div class="alt-flights">${j.items.map((x, i) => `<div class="alt-f">
          <div><b>${esc(x.out.carrierName || '')}</b> <span class="faint">${x.out.stops ? `${x.out.stops}× přestup` : 'přímý'}${x.back ? ` · zpět ${esc(x.back.carrierName || '')}${x.back.stops ? ` (${x.back.stops}× přestup)` : ''}` : ''}</span>
            <div class="faint" style="font-size:12px">${hhmm(x.out.dep)}–${hhmm(x.out.arr)}${plusDay(x.out.dep, x.out.arr)}${x.back ? ` · zpět ${hhmm(x.back.dep)}–${hhmm(x.back.arr)}${plusDay(x.back.dep, x.back.arr)}` : ''}</div></div>
          <div class="alt-p ${x.flightCzk < cur ? 'good' : ''}">${czk(x.flightCzk)}</div>
          <div class="row" style="gap:6px"><button class="btn sm" data-alt="${i}">Použít</button>${x.bookUrl ? `<a class="btn sm ghost" href="${esc(safeUrl(x.bookUrl))}" target="_blank" rel="noopener">Kiwi ↗</a>`
            : [x.out.bookUrl ? `<a class="btn sm ghost" href="${esc(safeUrl(x.out.bookUrl))}" target="_blank" rel="noopener">tam ↗</a>` : '', x.back && x.back.bookUrl ? `<a class="btn sm ghost" href="${esc(safeUrl(x.back.bookUrl))}" target="_blank" rel="noopener">zpět ↗</a>` : ''].join('')}</div></div>`).join('')}</div>
        ${j.items.some(x => x.out.stops) ? '<div class="faint" style="font-size:11.5px;margin-top:6px">Lety s přestupem přes Kiwi.com bývají samostatné letenky – Kiwi ručí za návaznost svou garancí.</div>' : ''}`;
      $$('[data-alt]', host).forEach(b => b.onclick = () => {
        const x = j.items[+b.dataset.alt];
        // vzdálenost a cílové město zůstávají (pro „Je to dobrá cena?“ – úroveň se u živé nabídky dopočítá)
        // doprava na letiště i cesta z letiště do města zůstávají (stejná letiště)
        // zavazadla z hledání zůstávají: příplatek u nové nabídky odhadne server (bagCzk); bez něj je neznáme
        const bagOk = !t.bags || t.bags === 'none' || Number.isFinite(x.bagCzk);
        const bag = bagOk && t.bags && t.bags !== 'none' ? x.bagCzk : 0;
        const ways = (t.flight.groundCzk || 0) + (t.flight.arrCzk || 0);
        const times = tripTimes(t), before = JSON.stringify(stayDates(t));
        // cena nabídky = letenky + zavazadla, s dopravou na letiště a do města tripCzk (jako server)
        t.flight = { ...x, bagCzk: bag, distanceKm: t.flight.distanceKm, destKey: t.flight.destKey, groundCzk: t.flight.groundCzk, arrCzk: t.flight.arrCzk || 0, perPersonCzk: x.flightCzk + bag, tripCzk: x.flightCzk + bag + ways, totalCzk: (x.flightCzk + bag) * t.adults, pricedAt: Date.now() };
        if (!bagOk) t.bags = 'none';
        // jiný čas příletu nebo odletu: program se sestaví znovu, auto s časy podle starého letu zadej znovu
        toast(retime(t, times) ? 'Let aktualizován – jiný čas příletu nebo odletu, zadej znovu auto' : 'Let aktualizován');
        // jiný den příletu nebo odletu: hotel vybraný na staré dny neplatí (jako po přepnutí na vlak / bus)
        if (JSON.stringify(stayDates(t)) !== before) {
          staysData = null;
          if (t.stay && t.stay.mode === 'pick') { t.stay = null; toast('Termín pobytu se změnil – vyber ubytování znovu'); }
          else if (t.stay && t.stay.mode === 'manual') toast('Termín pobytu se změnil – zkontroluj cenu ubytování');
        }
        if (isMulti(t)) reconcileStays(t); // jiný čas příletu může posunout termíny míst trasy (upozorní vlastní zprávou)
        persist(); render();
      });
    } catch (e) {
      host.innerHTML = `<div class="note warn" style="margin-top:12px">⚠️ <div>${esc(e.message)}</div></div>`;
    } finally {
      // nabídky jsou vyšší než řádek „Ověřuji…“ (na telefonu dole mohly zůstat pod lištou); jen když je krok pořád na obrazovce
      if (show && host.isConnected && $('#view-trip.active')) altIntoView();
    }
  }

  /* ---------- vlak / bus místo letu (blízký cíl) ---------- */
  /** Nabídka pod vybraným letem: cíl v dosahu vlaku/busu (odhad z hledání). */
  function groundOffer(t) {
    const g = t.groundRef;
    if (!g || !g.q || !window.Ground) return '';
    return `<div class="card step-card gnd-offer${g.worth ? ' hot' : ''}"><div class="sc-head"><div><h3>🚆 Nebo vlakem / busem</h3>
      <div class="muted">${esc(g.from)} → ${esc(g.to)} · ~${esc(Ground.hm(g.min))} · ${esc(Ground.priceTxt(g))} na osobu jedním směrem <span class="b">odhad</span></div>
      ${g.reason ? `<div class="faint" style="font-size:12.5px;margin-top:4px">${esc(g.reason)}</div>` : ''}</div></div>
      <div class="row wrap" style="gap:8px"><button class="btn${g.worth ? ' primary' : ''}" id="ovStart">🚆 Pojedu vlakem / busem</button></div>
      <div id="ovPick"></div></div>`;
  }

  /** Cesta vlakem/busem místo letu: úseky, cena, odkazy; zpět k letu jedním kliknutím. */
  function overlandStep() {
    const t = T(), ov = t.overland, host = $('#tripStep'), f = t.flight;
    const leg = (g, what, a, b) => g ? `<div class="ov-leg"><span class="ov-ic">${gIco(g)}</span><div><b>${what}: ${esc(a)} → ${esc(b)}</b> · ${dayLbl(g.date)} ${esc(gTime(g))}
      <small>${esc([g.dep ? `${minutesToHm(g.min || 0)} · ${gKind(g)}, ${g.transfers ? `${g.transfers}× přestup` : 'přímý'}` : 'odhad – konkrétní spoj vyber v odkazu',
    g.fromStation ? `${g.fromStation} → ${g.toStation}` : '', `${gPrice(g)}/os. (${gWho(g)})`].filter(Boolean).join(' · '))}</small></div></div>` : '';
    host.innerHTML = `<div class="card step-card"><h3>🚆 Cesta vlakem / busem</h3>
      <div class="muted" style="font-size:13px;margin-bottom:6px">~${+ov.km || 0} km vzdušnou čarou · místo letu ${esc(f.out.from)} → ${esc(f.out.to)}</div>
      ${leg(ov.out, 'Tam', ov.from.label, ov.to.label)}${leg(ov.back, 'Zpět', ov.to.label, ov.from.label)}
      ${!ov.back && f.back ? `<div class="note info" style="margin:8px 0 0">ℹ️ <div>Let zpět (${esc(f.back.from)} → ${esc(f.back.to)}) se nepočítá – byl součástí letenky. Cestu zpět si zařiď zvlášť${ov.q ? ', nebo v <b>🔄 Změnit spoje</b> zaškrtni „i zpět vlakem / busem“' : ''}.</div></div>` : ''}
      <div class="ov-sum"><span>Vlak / bus celkem za ${t.adults} os.:</span><b>${czk(costs(t).overland)}</b>${[ov.out, ov.back].some(g => g && g.source !== 'regiojet') ? '<span class="b warn">odhad – cenu ověř v odkazu</span>' : [ov.out, ov.back].some(g => g && g.demo) ? '<span class="b warn">DEMO – vymyšlené spoje a ceny</span>' : '<span class="b good">ceny RegioJetu z hledání</span>'}</div>
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
    const before = JSON.stringify(stayDates(t)), times = tripTimes(t), k0 = window.PreTrip ? PreTrip.tripKey(t) : '';
    // vlak/bus jen tam místo zpátečního letu: pobyt zůstane stejně dlouhý (ne výchozí noci cesty jen tam)
    if (ov && !ov.back && backLeg(t)) t.nightsOneWay = Math.min(30, Math.max(1, stayDates(t).nights));
    if (ov) t.overland = ov; else if (t.overland) t.overland.on = false;
    // odškrtnutí „Co zařídit a co sbalit“ jsou pod klíčem s datem cesty tam – zůstanou u cesty i s jiným dnem
    if (k0) PreTrip.copyDone(k0, PreTrip.tripKey(t));
    // Hlášení je jen jedno: upozornění na zahozený hotel (níže) ho musí přepsat, ne naopak.
    const msg = ov ? 'Pojedeš vlakem / busem – let se nepočítá' : 'Zpět k letu';
    toast(msg);
    const moved = JSON.stringify(stayDates(t)) !== before;
    if (moved) {
      staysData = null;
      // hotel jednoho místa i se zapnutou trasou – po přepnutí na Jedno místo by platil pro staré dny
      if (t.stay && t.stay.mode === 'pick') { t.stay = null; toast('Termín pobytu se změnil – vyber ubytování znovu'); }
      else if (t.stay && t.stay.mode === 'manual') toast('Termín pobytu se změnil – zkontroluj cenu ubytování');
      if (isMulti(t)) reconcileStays(t); // hlášení o hotelech míst trasy má přednost
    }
    // program a auto podle starých dní nebo časů příjezdu a odjezdu neplatí
    if (retime(t, times) && !moved) toast(`${msg}. Jiný čas příjezdu nebo odjezdu – zadej znovu auto`);
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
      // DEMO: vymyšlené spoje zůstanou označené i ve shrnutí
      return x ? { ...Ground.legFromLive(x, dateOf(w)), ...(j.live.demo ? { demo: true } : {}) } : Ground.legFromEst(dateOf(w), j.est);
    };
    const sum = () => {
      const legs = ['out', ...($('#ovRet').checked ? ['back'] : [])].map(pickedLeg);
      const ok = legs.every(Boolean);
      $('#ovUse').disabled = !ok;
      $('#ovSum').innerHTML = ok ? `<span>Za ${t.adults} os.:</span><b>${czk(legs.reduce((a, l) => a + (l.czk || 0), 0) * t.adults)}</b>${legs.some(l => l.source !== 'regiojet') ? '<span class="b warn">odhad</span>' : `<span class="b good">RegioJet – živé ceny${legs.some(l => l.demo) ? ' (DEMO)' : ''}</span>`}` : '<span class="faint">Načítám spoje…</span>';
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
    // změna dne: hned zneplatnit výběr, dotaz až po chvíli klidu (šipky v poli data)
    const loadSoon = { out: Ground.debounce(load), back: Ground.debounce(load) };
    const reload = w => { st[w] = null; sum(); loadSoon[w](w); };
    $('#ovOut').onchange = () => {
      if ($('#ovRet').checked && dateOf('back') < dateOf('out')) { $('#ovBack').value = dateOf('out'); reload('back'); }
      reload('out');
    };
    $('#ovBack').onchange = () => { if (dateOf('back') < dateOf('out')) { $('#ovBack').value = dateOf('out'); toast('Návrat nemůže být před cestou tam', 'err'); } reload('back'); };
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
      const n = Math.min(30, Math.max(1, +ow.value || 3));
      if (n === t.nightsOneWay) { ow.value = n; return; } // beze změny (např. 50 → 30) nic nezahazuj
      t.nightsOneWay = n;
      staysData = null;
      t.plan = null; // program pro jiný počet dní neplatí
      let msg = '';
      // cesta přes víc měst jen tam: noci posledního města (hotel tam na jiné dny pryč – hlásí reconcileStays)
      if (isFly(t)) { t.route.bases.at(-1).nights = n; reconcileStays(t); }
      if (t.route && t.route.mode === 'multi' && t.route.bases.length && nightsLeft(t) !== 0) msg = 'Počet nocí se změnil – uprav jejich rozdělení v trase';
      // Cena vybraného hotelu platila pro původní počet nocí → vyber znovu (ruční cenu nech, ale upozorni); i se zapnutou
      // trasou – po přepnutí na Jedno místo by platil se starým termínem (hlášení o trase má přednost).
      if (t.stay && t.stay.mode === 'pick') { t.stay = null; msg ||= 'Počet nocí se změnil – vyber ubytování znovu'; }
      else if (t.stay && t.stay.mode === 'manual') msg ||= 'Zkontroluj cenu ubytování pro nový počet nocí';
      // auto se vrací podle konce pobytu (cesta jen tam) → s jiným počtem nocí zadej znovu
      if (t.car && t.car.mode !== 'skip') { t.car = null; msg = msg ? `${msg}. Zadej znovu i auto` : 'Počet nocí se změnil – zadej znovu auto'; }
      if (msg) toast(msg);
      persist(); render();
    };
  }

  function routeStep() {
    const t = T();
    const host = $('#tripStep');
    if (isFly(t)) return flyRouteStep(t, host);
    const { checkin, checkout, nights } = stayDates(t);
    const canMulti = nights >= 2;
    const multi = canMulti && Boolean(t.route && t.route.mode === 'multi');
    host.innerHTML = `<div class="card step-card">
      <div class="sc-head"><div><h3>🗺️ Trasa pobytu</h3><div class="muted">${dayLbl(checkin)} – ${dayLbl(checkout)} · ${nightsTxt(nights)} · zůstaneš na jednom místě, nebo poznáš víc míst?</div></div></div>
      ${oneWayField(t)}
      <div class="route-choice">
        <button type="button" class="rc-opt ${multi ? '' : 'on'}" data-rmode="single" aria-pressed="${!multi}"><span class="rc-ic">🏨</span><span><b>Jedno místo celý pobyt</b><small>${esc(t.dest.label.replace(/ \(.*\)$/, ''))} · ${nights < 1 ? 'bez přespání (návrat týž den)' : `jeden hotel na ${nightsTxt(nights)}`}, výlety do okolí naplánuješ v programu.</small></span></button>
        <button type="button" class="rc-opt ${multi ? 'on' : ''}" data-rmode="multi" aria-pressed="${multi}" ${canMulti ? '' : 'disabled'}><span class="rc-ic">🧭</span><span><b>Víc míst</b><small>${canMulti ? 'Navrhnu trasu přes 2–4 zajímavá města s přejezdy a rozdělím noci – pak ke každému místu vybereš hotel.' : (nights < 1 ? 'Bez přespání není co rozdělit.' : 'Na jednu noc není co rozdělit.')}</small></span></button>
      </div>
      <div id="routeBody"></div>
    </div>`;
    wireOneWay(t);
    $$('[data-rmode]', host).forEach(b => b.onclick = () => setRouteMode(b.dataset.rmode));
    if (multi) return routeEditor();
    $('#routeBody').innerHTML = '<div class="row wrap" style="gap:8px"><button class="btn primary" id="rtNext">Pokračovat k ubytování →</button></div>';
    $('#rtNext').onclick = () => setStep('stay');
  }

  /** Trasa podle letů: místa, noci i lety mezi nimi jsou dané – přehled s mapou, dál k ubytování. */
  function flyRouteStep(t, host) {
    const r = t.route, dates = baseDates(t), mid = midLegs(t), f = t.flight, n = r.bases.length;
    const legRow = (l, ico, what) => `<div class="rt-tr"><span class="rt-ic">${ico}</span><div><b>${what} ${esc(l.from)} → ${esc(l.to)}</b> <span class="faint">${depHm(l) ? `${depHm(l)} → ${arrHm(l) || '?'}` : 'čas ověř'}${l.carrierName ? ' · ' + esc(l.carrierName) : ''}</span><div class="faint">${dayLbl(l.date)}</div></div></div>`;
    // další let odlétá z jiného letiště, než kam se přiletělo: druhé letiště téhož města (CIA → FCO) jen poznámka,
    // jiné město (Řím → let z Neapole) – cestu tam si zařídí sám
    const gap = i => {
      const a = i ? mid[i - 1] : f.out, d = mid[i] || f.back;
      if (!d || a.to === d.from) return '';
      const g = gapAt(t, i), x = gapLeg(t, g);
      if (!g) return `<div class="faint" style="font-size:12.5px">odlétáš z jiného letiště (${esc(d.from)}) – cesta na něj je v průběhu cesty</div>`;
      if (x) return `<div class="rt-gap">${trIcon('transit', x)} Na letiště ${esc(d.from)}: <b>${legTxt(x, 'transit')}</b> <span class="faint">(${estTxt(x, 'transit')}${x.fareCzk ? `, ~${czk(x.fareCzk)}/os.` : ''})</span>${legLink(x, 'transit') ? ` · ${legLink(x, 'transit')}` : ''}</div>`;
      if (x === false) return `<div class="rt-warn">⚠️ Další let odlétá z ${esc(d.from)}, přiletíš na ${esc(a.to)} – cestu mezi letišti si naplánuj</div>`;
      return `<div class="faint" style="font-size:12.5px"><span class="spin dark"></span> počítám cestu na letiště ${esc(d.from)}…</div>`;
    };
    host.innerHTML = `<div class="card step-card">
      <div class="sc-head"><div><h3>🗺️ Trasa podle letů</h3><div class="muted">${n} ${n <= 4 ? 'místa' : 'míst'} · ${nightsTxt(stayDates(t).nights)} · noci dávají data letů${f.back ? '' : ', v posledním místě zvolíš sám'} – ke každému místu pak vybereš ubytování a program.</div></div></div>
      <div class="ex-layout route-layout"><div><div class="route-list">
        ${legRow(f.out, '🛫', 'Let tam')}
        ${r.bases.map((b, i) => `<div class="rb"><span class="rb-n" style="background:${BASE_COLORS[i % BASE_COLORS.length]}">${i + 1}</span><div class="rb-main"><div class="rb-name">${esc(b.name)}</div><div class="rb-dates">${dayLbl(dates[i].checkin)} – ${dayLbl(dates[i].checkout)}${hotelName(b.stay) ? ` · 🏨 ${esc(hotelName(b.stay))}` : ''}</div>${gap(i)}</div><div class="rb-nights"><span><b>${dates[i].nights}</b> ${nightWord(dates[i].nights)}</span></div></div>${i < n - 1 ? legRow(mid[i], '✈️', `${i + 2}. let`) : ''}`).join('')}
        ${f.back ? legRow(f.back, '🛬', 'Let zpět') : ''}
      </div>${f.back ? '' : oneWayField(t).replace('Kolik nocí zůstaneš?', `Kolik nocí zůstaneš v posledním místě (${esc(r.bases.at(-1).name)})?`).replace('margin-bottom:12px', 'margin:12px 0')}</div><div class="ex-map route-map" id="rtMap"></div></div>
      <div class="row wrap" style="gap:8px;margin-top:14px"><button class="btn primary" id="rtNext">Pokračovat k ubytování →</button></div></div>`;
    routeMapPaint = null;
    if (window.Places && Places.routeMap) paintRouteMap(t); else $('#rtMap').remove();
    wireOneWay(t);
    $('#rtNext').onclick = () => { stayIdx = Math.max(0, r.bases.findIndex(b => !b.stay)); progIdx = 0; setStep('stay'); };
    loadGaps(t);
  }
  /** Přejezdy z místa na letiště jiného města (gapAt), které ještě nejsou spočítané – po spočítání krok Trasa znovu. */
  let gapsBusy = false;
  async function loadGaps(t) {
    const r = t.route, todo = r.bases.map((b, i) => gapAt(t, i)).filter(g => g && gapLeg(t, g) === null);
    if (!todo.length || gapsBusy) return;
    gapsBusy = true;
    try {
      for (const g of todo) {
        let x = false;
        try {
          const j = await postJson('api/stayplan', { arrival: g.a.to, departure: g.d.from, transport: 'transit', bases: [{ name: g.b.name, lat: g.b.lat, lon: g.b.lon, cc: g.b.cc || '' }] });
          x = j.legs && j.legs.departure && Number.isFinite(j.legs.departure.transitMin) ? j.legs.departure : false;
        } catch (e) { x = false; }
        if (T() !== t) return;
        r.gaps = { ...(r.gaps || {}), [g.key]: x };
      }
      persist();
      if (t.step === 'route' && $('#view-trip.active')) render(); else refreshHead();
    } finally { gapsBusy = false; }
  }

  function setRouteMode(mode) {
    const t = T();
    if (mode === 'multi') {
      if (stayDates(t).nights < 2) return;
      if (!t.route || !Array.isArray(t.route.bases)) t.route = { mode: 'multi', transport: 'car', bases: [], transfers: [], legs: {}, exclude: [], candidates: [], notes: [] };
      t.route.mode = 'multi';
      // termín cesty se mohl změnit, když byla trasa vypnutá (vlak/bus, jiný let) → hotely míst na staré dny pryč
      if (t.route.bases.length) reconcileStays(t);
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
    // Sdílená cesta, přerušený přepočet nebo nově vlak/bus místo letu: přejezdy chybí → dopočítat.
    if (!Array.isArray(r.transfers) || r.transfers.length !== r.bases.length - 1) refreshTransfers();
    // přejezdy ze starší verze (odhad bez druhu dopravy a hranic) nebo chybějící přejezdy z města příjezdu vlakem/busem
    else if (r.transfers.some(x => !x || !x.transitKind) || (ovOn(t) && !(r.groundLegs && r.groundLegs.key === groundKey(t)))) refreshTransfers({ keep: true });
  }

  function baseRow(t, b, i, d, left) {
    const n = t.route.bases.length;
    const why = [b.reason, b.highlights && b.highlights.length ? '👀 ' + b.highlights.join(', ') : ''].filter(Boolean).join(' · ');
    return `<div class="rb">
      <span class="rb-n" style="background:${BASE_COLORS[i % BASE_COLORS.length]}">${i + 1}</span>
      <div class="rb-main"><div class="rb-name">${esc(b.name)}</div>
        <div class="rb-dates">${dayLbl(d.checkin)} – ${dayLbl(d.checkout)}${hotelName(b.stay) ? ` · 🏨 ${esc(hotelName(b.stay) + nearOf(b.stay))}` : ''}</div>
        ${why ? `<div class="rb-why">${esc(why)}</div>` : ''}</div>
      <div class="rb-nights"><button type="button" data-nm="${i}" ${b.nights <= 1 ? 'disabled' : ''} title="O noc méně" aria-label="O noc méně">−</button><span><b>${b.nights}</b> ${nightWord(b.nights)}</span><button type="button" data-np="${i}" ${left <= 0 || b.nights >= 30 ? 'disabled' : ''} title="O noc víc" aria-label="O noc víc">+</button></div>
      <div class="rb-acts"><button type="button" data-up="${i}" ${i === 0 ? 'disabled' : ''} title="Posunout dřív" aria-label="Posunout dřív">↑</button><button type="button" data-down="${i}" ${i === n - 1 ? 'disabled' : ''} title="Posunout později" aria-label="Posunout později">↓</button><button type="button" data-del="${i}" ${n <= 1 ? 'disabled' : ''} title="Odebrat z trasy" aria-label="Odebrat z trasy">✕</button></div>
    </div>`;
  }

  // Odkaz do Google Map: autem trasa, veřejnou dopravou jen ověření spojů (časy jsou odhad).
  const legLink = (x, tr, long) => { const u = legUrl(x, tr); return u ? `<a href="${esc(safeUrl(u))}" target="_blank" rel="noopener">${tr === 'transit' ? 'ověř spoje' : 'trasa'}${long ? ' v Google Maps' : ''} ↗</a>` : ''; };
  function transferRow(x, a, b, tr, date) {
    const other = x ? (tr === 'transit' ? `autem ~${minutesToHm(x.carMin)}` : `${trIcon('transit', x)} ${kindTxt(x)} ~${minutesToHm(x.transitMin)}`) : '';
    const link = x ? legLink(x, tr, true) : '';
    return `<div class="rt-tr ${x && x.long ? 'long' : ''}"><span class="rt-ic">${trIcon(tr, x)}</span><div>
      ${x ? `<b>${legTxt(x, tr)}</b> <span class="faint">(${estTxt(x, tr)}; ${other})</span>` : '<span class="faint">počítám přejezd…</span>'}
      <div class="faint">${dayLbl(date)} · ${esc(a.name)} → ${esc(b.name)}${link ? ` · ${link}` : ''}</div>
      ${x ? borderNote(x.border) : ''}
      ${x && x.long ? '<div class="rt-warn">⚠️ Dlouhý přejezd</div>' : ''}</div></div>`;
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
    // kde se mezi místy vlakem nejezdí (podle přejezdů ze serveru), nenabízet „vlakem“
    const allBus = (r.transfers || []).length > 0 && r.transfers.every(x => x && x.transitKind === 'bus');
    $('#rtTools').innerHTML = `<div class="seg">${[['car', '🚗 Autem'], ['transit', allBus ? '🚌 Autobusem' : '🚆 Vlakem a busem']].map(([v, l]) => `<button type="button" data-tr="${v}" class="${tr === v ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="seg" title="Kolik míst navrhnout">${[2, 3, 4].filter(k => k <= total).map(k => `<button type="button" data-cnt="${k}" class="${r.want === k ? 'on' : ''}">${k} místa</button>`).join('')}</div>
      <button type="button" class="btn sm ghost" id="rtAgain">↻ Navrhnout znovu</button>`;
    const legRow = (x, ic, html) => `<div class="rt-leg"><span class="rt-ic">${ic}</span><div>${html}${x && x.km >= 1 ? `<div class="faint">${trIcon(tr, x)} ${legTxt(x, tr)} (${estTxt(x, tr)})${legLink(x, tr) ? ` · ${legLink(x, tr)}` : ''}</div>${borderNote(x.border)}` : ''}</div></div>`;
    const legs = r.legs || {};
    const ov = ovOn(t), o = outLeg(t), bk = backLeg(t), ovl = ov ? overlandLegs(t) : null;
    const sum = n < 2 ? ['warn', 'Přidej aspoň jedno další místo (níže), nebo zůstaň na jednom místě.']
      : left === 0 ? ['ok', `✓ Všech ${nightsTxt(total)} rozděleno mezi ${n} ${n <= 4 ? 'místa' : 'míst'}`]
        : left > 0 ? ['warn', `Rozděleno ${total - left} z ${total} nocí – zbývá rozdělit ${nightsTxt(left)} (tlačítko +)`]
          : ['warn', `Rozděleno o ${nightsTxt(-left)} víc, než trvá pobyt (${nightsTxt(total)}) – ${r.bases.some(b => b.nights > 1) ? 'uber tlačítkem −' : 'odeber místo tlačítkem ✕'}`];
    list.innerHTML = `${r.demo ? '<div class="faint" style="font-size:12px;margin-bottom:8px">⚠️ demo data – vymyšlená města</div>' : ''}
      <div class="route-list">
        ${ov ? legRow(ovl.arrival, '🚆', `Příjezd vlakem / busem <b>${esc(t.overland.to.label)}</b> · ${dayLbl(o.date)}${o.hasTime ? ' ' + hhmm(o.arr) + plusDay(o.dep, o.arr) : ''}`)
          : legRow(legs.arrival, '✈️', `Přílet <b>${esc(f.out.to)}</b> · ${dayLbl(f.out.date)}${arrHm(f.out) ? ' ' + arrHm(f.out) : ''}`)}
        ${r.bases.map((b, i) => baseRow(t, b, i, dates[i], left) + (i < n - 1 ? transferRow(r.transfers && r.transfers[i], b, r.bases[i + 1], tr, dates[i].checkout) : '')).join('')}
        ${ov ? (bk ? legRow(ovl.departure, '🚆', `Odjezd vlakem / busem <b>${esc(t.overland.to.label)}</b> · ${dayLbl(bk.date)}${bk.hasTime ? ' ' + hhmm(bk.dep) : ''}`) : '')
          : f.back ? legRow(legs.departure, '🛫', `Odlet <b>${esc(f.back.from)}</b> · ${dayLbl(f.back.date)}${f.back.hasTime ? ' ' + hhmm(f.back.dep) : ''}`) : ''}
      </div>
      <div class="route-sum ${sum[0]}">${esc(sum[1])}</div>
      ${routeNotes(t).map(x => `<div class="note warn" style="margin-top:8px">⚠️ <div>${esc(x)}</div></div>`).join('')}`;
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
    $$('[data-entry]', list).forEach(b => b.onclick = () => { if (typeof openCountry === 'function') openCountry(b.dataset.entry); });
    // vstupní podmínky do poznámky u hranice, až se načtou
    if (window.Entry && !Entry.ready() && !entryWait && list.querySelector && list.querySelector('.rt-border')) {
      entryWait = true;
      Entry.whenReady(() => { entryWait = false; paintRoute(); });
      Entry.load().catch(() => { entryWait = false; });
    }
    const nx = $('#rtNext'); if (nx) nx.disabled = !routeReady(t);
    refreshHead();
    paintRouteMap(t);
  }

  // Mapa trasy: letiště příletu (střed), očíslovaná místa, letiště odletu, přejezdy čárkovaně.
  // S vlakem/busem místo letu začíná (a končí) ve městě příjezdu, ne na letišti.
  function paintRouteMap(t) {
    const r = t.route, el = $('#rtMap');
    if (!el || !r.bases.length || !(window.Places && Places.routeMap)) return;
    const ov = ovOn(t) ? t.overland : null;
    const arr = ov ? { lat: ov.to.lat, lon: ov.to.lon } : r.arrival, a = arr || r.bases[0];
    if (!routeMapPaint || routeMapPaint.el !== el) {
      routeMapPaint = Places.routeMap(el, { lat: a.lat, lon: a.lon, label: ov ? `🚆 ${ov.to.label}` : r.arrival ? `✈️ Přílet ${r.arrival.iata}` : r.bases[0].name, geo: true });
      routeMapPaint.el = el;
    }
    const pts = r.bases.map((b, i) => ({ id: 'b' + i, lat: b.lat, lon: b.lon, color: BASE_COLORS[i % BASE_COLORS.length], num: i + 1, big: true, label: `${i + 1}. ${b.name} · ${nightsTxt(b.nights)}`, q: [b.name, b.country].filter(Boolean).join(', ') }));
    const dep = backLeg(t) && (ov ? arr : r.departure);
    if (!ov && dep && (!r.arrival || dep.iata !== r.arrival.iata)) pts.push({ id: 'dep', lat: dep.lat, lon: dep.lon, color: '#a855f7', label: `✈️ Odlet ${dep.iata}`, q: `${dep.iata} airport` });
    routeMapPaint(pts, [arr, ...r.bases, dep].filter(Boolean).map(p => [p.lon, p.lat]));
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

  const pickCand = c => ({ id: String(c.id), name: c.name, nameEn: c.nameEn || '', lat: c.lat, lon: c.lon, cc: c.cc || '', country: c.country || '', reason: c.reason || '', highlights: (c.highlights || []).slice(0, 3), ...(Number.isInteger(c.gid) ? { gid: c.gid } : {}) });

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
    if (isFly(t)) return;
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
      Object.assign(r, { transfers: j.transfers, legs: j.legs, arrival: j.arrival, departure: j.departure, candidates: (j.candidates || []).map(pickCand), notes: j.notes || [], want: j.want, demo: Boolean(j.demo), groundLegs: null });
      reconcileStays(t); persist(); paintRoute();
      // vlakem/busem místo letu: přejezdy z města příjezdu; trasy autem, které server ještě počítá, za chvíli
      if (ovOn(t)) refreshTransfers({ keep: true });
      else if (j.pending > 0) pollTransfers(t, 0);
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

  /** Přejezdy, které server ještě počítá (trasa autem): za chvíli znovu – hotové má v mezipaměti (nejvýš 3×). */
  function pollTransfers(t, poll) {
    if (routePoll) clearTimeout(routePoll);
    const my = routeSeq;
    if (poll < 3) routePoll = setTimeout(() => { if (T() === t && t.step === 'route' && my === routeSeq) refreshTransfers({ keep: true, poll: poll + 1 }); }, 6000);
  }

  async function refreshTransfers({ keep = false, poll = 0 } = {}) {
    const t = T(), r = t.route;
    if (isFly(t)) return; // mezi místy se letí
    const my = ++routeSeq;
    if (routePoll) clearTimeout(routePoll);
    if (!keep) r.transfers = [];
    paintRoute();
    if (!r.bases.length) return;
    try {
      const ground = ovOn(t) ? groundPlace(t) : null, gk = ground ? groundKey(t) : '';
      const j = await postJson('api/stayplan', { ...tripAirports(t), transport: r.transport || 'car', bases: r.bases.map(b => ({ name: b.name, lat: b.lat, lon: b.lon, cc: b.cc || '' })), ...(ground ? { ground } : {}) });
      if (my !== routeSeq || T() !== t) return;
      Object.assign(r, { transfers: j.transfers, legs: j.legs, notes: j.notes || [], arrival: j.arrival, departure: j.departure, groundLegs: j.groundLegs ? { key: gk, ...j.groundLegs } : null });
      // země míst přidaných ručně (server ji dopočte podle polohy) – pro ubytování a vstupní podmínky
      (Array.isArray(j.bases) ? j.bases : []).forEach((x, i) => {
        const b = r.bases[i];
        if (b && x && /^[A-Z]{2}$/.test(x.cc || '') && !b.cc) Object.assign(b, { cc: x.cc, country: b.country || String(x.country || '') });
      });
      persist(); paintRoute();
      if (j.pending > 0) pollTransfers(t, poll);
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
      // gid (ID GeoNames): server podle něj najde anglický název pro partnery ubytování („Benátky“ → „Venice“)
      addBase({ id: `geo:${(+s.lat).toFixed(4)},${(+s.lon).toFixed(4)}`, name: String(s.label || '').replace(/ \(.*\)$/, ''), lat: +s.lat, lon: +s.lon, cc: /^[A-Z]{2}$/.test(cc) ? cc : '', country: (typeof byIso !== 'undefined' && byIso[cc] && byIso[cc].cs) || '', gid: Number.isInteger(s.gid) ? s.gid : null });
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
  // Neúplná odpověď: část cen nestihla přijít, nebo zdroj cen selhal – návrat do kroku se zeptá znovu.
  const staysIncomplete = d => Boolean(d && (d.providers || []).some(p => !p.ok || p.partial));
  /**
   * Nabídky ubytování (api/stays) pro místo a termín – v paměti, ať přepínání míst trasy nenačítá znovu (jen úplné
   * odpovědi). Po „Zkusit znovu“ s retry=1: server neúplný výsledek přepočítá hned (doptá se jen na chybějící ceny);
   * po „Aktualizovat ceny“ (fresh) s fresh=1 zjistí ceny hotelů znovu. got = kdy odpověď přišla, params = dotaz (pro fresh).
   */
  async function loadStays(key, params, { fresh = false } = {}) {
    const retry = staysRetry === key;
    if (!retry && !fresh && staysCache.has(key)) return staysCache.get(key);
    // místo načítané dopředu (warmStays, Vyber za mě) a jeho záložka se nezeptají dvakrát
    if (!retry && !fresh && staysLoading.has(key)) return staysLoading.get(key);
    const p = (async () => {
      const r = await fetch('api/stays?' + new URLSearchParams({ ...params, ...(retry ? { retry: 1 } : {}), ...(fresh ? { fresh: 1 } : {}) }));
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      if (retry) staysRetry = null;
      const d = { key, ...j, got: Date.now(), params: { ...params } };
      if (staysIncomplete(d)) staysCache.delete(key);
      else staysCache.set(key, d);
      return d;
    })();
    if (!retry && !fresh) {
      staysLoading.set(key, p);
      const done = () => { if (staysLoading.get(key) === p) staysLoading.delete(key); };
      p.then(done, done);
    }
    return p;
  }

  // Další místa trasy se načtou dopředu, jedno po druhém, když má aktuální místo nabídky (ceny už nedoplňuje): přepnutí
  // záložky ani „Vyber za mě“ pak nečeká na dohledání místa a cen (malé místo bez TripAdvisoru i 15 s) – server má
  // výsledek v mezipaměti. Jen místa bez vybraného ubytování, napřed ta za aktuálním (pořadí „Další místo“).
  // Každé místo a termín nejvýš jednou (neúplný výsledek se do staysCache neukládá – další překreslení by se ptalo znovu).
  let staysWarm = false;
  const staysWarmed = new Set();
  async function warmStays(t) {
    if (staysWarm || autoBusy || !t || !isMulti(t) || t.step !== 'stay') return;
    const bs = t.route.bases, dates = baseDates(t), n = bs.length;
    const todo = bs.map((b, j) => (stayIdx + 1 + j) % n).filter(j => j !== stayIdx && !bs[j].stay && dates[j] && dates[j].nights >= 1)
      .map(j => baseStayQuery(t, bs[j], dates[j])).filter(x => !staysCache.has(x.key) && !staysWarmed.has(x.key));
    if (!todo.length) return;
    staysWarm = true;
    try {
      for (const { key, params } of todo) {
        if (T() !== t || t.step !== 'stay' || autoBusy) break; // jiná cesta, krok, nebo Vyber za mě (načítá sám)
        staysWarmed.add(key);
        try { await loadStays(key, params); } catch (e) { /* nevadí – záložka se zeptá sama */ }
      }
    } finally { staysWarm = false; }
  }

  // Ceny hotelů se zjišťují jedna po druhé (živě bývá 5–15 s): když se po 4 s pořád hledá, poznámka proč a co mezitím
  // (objeví se sama přes CSS animaci se zpožděním – s výsledky zmizí s celým obsahem #stayBody)
  // Vybrané ubytování bez ceny (z OpenStreetMap v malém místě, kde TripAdvisor ceny nemá): název se předvyplní do vlastní
  // ceny a uložením cena přibude k vybranému ubytování (odkaz na hledání u partnera zůstane), jiný název = vlastní ubytování
  const noPricePick = s => Boolean(s && s.mode === 'pick' && !(s.totalCzk > 0));
  const manNameVal = s => (s && (s.mode === 'manual' || noPricePick(s)) ? s.name || '' : '');
  const manualStay = (cur, name, price) => (noPricePick(cur) && (!name || name === cur.name)
    ? { ...cur, totalCzk: price } : { mode: 'manual', name: name || 'Vlastní ubytování', totalCzk: price });
  const manLead = (s, what) => (noPricePick(s) ? `Cenu za <b>${esc(s.name)}</b> ověř u partnera a zadej ji (celkem za ${what}):`
    : `Vybral sis jinde? Zadej celkovou cenu ${what === 'pobyt' ? 'a pokračuj' : `za ${what}`}:`);
  const STAY_LOADING = '<div class="loading-row"><span class="spin dark"></span> Hledám ubytování s nejlepším poměrem ceny a hodnocení…</div><div class="slow faint">Ceny se zjišťují u jednotlivých hotelů – obvykle do 15&nbsp;s. Mezitím můžeš níž zadat vlastní cenu.</div>';
  // klíč nabídek ubytování jednoho místa (místo, dny, počet hostů) – i ke kontrole, že staysData patří této cestě
  const stayKeyOf = t => { const { checkin, checkout } = stayDates(t); return `${t.dest.label}|${checkin}|${checkout}|${t.adults}`; };
  async function stayStep() {
    const t = T();
    if (isMulti(t)) return stayStepMulti();
    staySlot = { get: () => T().stay, set: v => { T().stay = v; }, next: () => setStep('car') };
    const host = $('#tripStep');
    const { checkin, checkout, nights } = stayDates(t);
    host.innerHTML = `<div class="card step-card">
      <div class="sc-head"><div><h3>🏨 Ubytování · ${esc(t.dest.label)}</h3><div class="muted">${dayLbl(checkin)} – ${dayLbl(checkout)} · ${nightsTxt(nights)} · ${t.adults} ${t.adults === 1 ? 'host' : t.adults <= 4 ? 'hosté' : 'hostů'}</div></div>
      ${t.stay ? `<div class="chosen">Vybráno: <b>${esc(t.stay.name || (t.stay.mode === 'skip' ? 'bez ubytování' : ''))}</b>${t.stay.totalCzk ? ` · ${czk(t.stay.totalCzk)}${t.stay.est ? ' <span class="faint">(odhad)</span>' : ''}` : ''}</div>` : ''}</div>
      ${oneWayField(t)}
      <div id="stayBody">${STAY_LOADING}</div>
      <div class="divider"></div>
      <div class="manual-row"><div class="muted" style="font-size:13px">${manLead(t.stay, 'pobyt')}</div>
        <input class="input" id="manName" placeholder="Název (nepovinné)" value="${esc(manNameVal(t.stay))}">
        <input class="input" id="manPrice" type="number" min="0" step="100" placeholder="Cena celkem v Kč" value="${t.stay && t.stay.mode === 'manual' ? t.stay.totalCzk : ''}">
        <button class="btn" id="manSave">Uložit</button></div>
      <div class="row wrap" style="gap:8px;margin-top:14px"><button class="btn ghost" id="staySkip">Ubytování neřeším →</button>${t.stay ? '<button class="btn primary" id="stayNext">Pokračovat →</button>' : ''}</div>
    </div>`;
    wireOneWay(t);
    $('#manSave').onclick = () => {
      const price = +$('#manPrice').value;
      if (!(price > 0)) return toast('Zadej cenu ubytování', 'err');
      pickSeq++; t.stay = manualStay(t.stay, $('#manName').value.trim(), price);
      persist(); setStep('car');
    };
    $('#staySkip').onclick = () => { pickSeq++; t.stay = { mode: 'skip', name: 'bez ubytování', totalCzk: 0 }; persist(); setStep('car'); };
    const nx = $('#stayNext'); if (nx) nx.onclick = () => setStep('car');

    if (nights < 1) {
      $('#stayBody').innerHTML = '<div class="note info">ℹ️ <div>Zpáteční let je ještě týž den – ubytování není potřeba. Klikni na <b>Ubytování neřeším</b>.</div></div>';
      return;
    }
    const key = stayKeyOf(t);
    if (!staysData || staysData.key !== key || staysIncomplete(staysData)) {
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

  function goStayBase(i) { stayIdx = i; stayView.n = 0; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
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
    const left = r.bases.filter(x => !x.stay).length, allDone = !left, sumStay = r.bases.reduce((a, x) => a + (stayCzk(x.stay) || 0), 0);
    host.innerHTML = `<div class="card step-card">
      <div class="sc-head"><div><h3>🏨 Ubytování na trase</h3><div class="muted">${n} ${n <= 4 ? 'místa' : 'míst'} · ${nightsTxt(total)} · ${t.adults} ${t.adults === 1 ? 'host' : t.adults <= 4 ? 'hosté' : 'hostů'} · vybráno ${r.bases.filter(x => x.stay).length} z ${n}</div></div></div>
      ${allDone ? `<div class="auto-pick ok"><div class="ap-t"><b>✓ Ubytování máš ve všech místech</b><small>${sumStay ? `Celkem ${czk(sumStay)} · ` : ''}změnit ho můžeš v záložkách níž.</small></div><button type="button" class="btn primary" id="stayDone">Pokračovat k autu →</button></div>` : ''}
      ${left ? `<div class="auto-pick"><div class="ap-t"><b>✨ Nechceš vybírat?</b><small>V ${left === n ? `každém místě` : `${left} ${left === 1 ? 'zbývajícím místě' : 'zbývajících místech'}`} vyberu hotel s nejlepším poměrem ceny a hodnocení. Změnit ho můžeš kdykoliv v záložkách.</small></div><button type="button" class="btn primary" id="stayAuto"${autoBusy ? ' disabled' : ''}>${autoBusy ? '<span class="spin"></span> Vybírám…' : 'Vyber za mě'}</button></div>` : ''}
      ${baseTabs(r, i, x => Boolean(x.stay), 'data-bt')}
      <div class="sc-head" style="margin-top:14px"><div><h3 style="font-size:15.5px">${i + 1}. ${esc(b.name)}</h3><div class="muted">${dayLbl(d.checkin)} – ${dayLbl(d.checkout)} · ${nightsTxt(d.nights)}</div></div>
        ${b.stay ? `<div class="chosen">Vybráno: <b>${esc(stayState(b.stay))}</b>${stayCzk(b.stay) ? ` · ${czk(stayCzk(b.stay))}${b.stay.est ? ' <span class="faint">(odhad)</span>' : ''}` : ''}</div>` : ''}</div>
      <div id="stayBody">${STAY_LOADING}</div>
      <div class="divider"></div>
      <div class="manual-row"><div class="muted" style="font-size:13px">${manLead(b.stay, nightsTxt(d.nights))}</div>
        <input class="input" id="manName" placeholder="Název (nepovinné)" value="${esc(manNameVal(b.stay))}">
        <input class="input" id="manPrice" type="number" min="0" step="100" placeholder="Cena celkem v Kč" value="${b.stay && b.stay.mode === 'manual' ? b.stay.totalCzk : ''}">
        <button class="btn" id="manSave">Uložit</button></div>
      <div class="row wrap" style="gap:8px;margin-top:14px"><button class="btn ghost" id="stayLinks">Vyberu později – jen odkazy →</button><button class="btn primary" id="stayNext">${i < n - 1 && !allDone ? `Další místo: ${esc(r.bases[i + 1].name)} →` : 'Pokračovat k autu →'}</button></div>
    </div>`;
    $$('[data-bt]', host).forEach(x => x.onclick = () => goStayBase(+x.dataset.bt));
    const sd = $('#stayDone'); if (sd) sd.onclick = () => setStep('car');
    const ab = $('#stayAuto');
    if (ab && !autoBusy) ab.onclick = async () => {
      ab.disabled = true;
      const res = await autoPickStays(t, (k, of, name) => { ab.innerHTML = `<span class="spin"></span> ${esc(name)} ${k}/${of}`; });
      if (T() !== t) return;
      const vf = res.verified.length === res.ok.length ? ' · volno ověřeno teď' : res.verified.length ? ` · volno ověřeno: ${res.verified.join(', ')}` : '';
      const np = res.noPrice.length ? `${res.noPrice.join(', ')}: TripAdvisor tu ceny nemá – vyber z ubytování v místě a doplň cenu` : '';
      if (res.ok.length) toast(`Vybráno: ${res.ok.join(', ')}${vf}${res.unsure.length ? ` · volno se nepodařilo ověřit: ${res.unsure.join(', ')}` : ''}${res.miss.length ? ` · bez cen zatím: ${res.miss.join(', ')}` : ''}${np ? ` · ${np}` : ''}`, '', np ? 7000 : 5200);
      else if (np && !res.miss.length) toast(np, 'info', 6000);
      else toast('Ceny hotelů zatím nepřišly – vyber prosím ručně, nebo to zkus za chvíli', 'err', 4200);
      // zůstaň v Ubytování: záložky s ✓ ukážou výběr; první místo bez ubytování, jinak to aktuální
      const miss = r.bases.findIndex(x => !x.stay);
      if (t.step === 'stay') goStayBase(miss >= 0 ? miss : i);
    };
    $('#manSave').onclick = () => {
      const price = +$('#manPrice').value;
      if (!(price > 0)) return toast('Zadej cenu ubytování', 'err');
      pickSeq++; staySlot.set(manualStay(b.stay, $('#manName').value.trim(), price));
      persist(); staySlot.next();
    };
    $('#stayLinks').onclick = () => { pickSeq++; staySlot.set({ mode: 'links', name: '', totalCzk: 0 }); persist(); staySlot.next(); };
    $('#stayNext').onclick = () => (i < n - 1 && !allDone ? goStayBase(i + 1) : setStep('car'));
    const { params, key } = baseStayQuery(t, b, d);
    let data;
    try {
      data = await loadStays(key, params);
    } catch (e) {
      if (T() === t && t.step === 'stay' && stayIdx === i) $('#stayBody').innerHTML = `<div class="note warn">⚠️ <div>Nabídky se nepodařilo načíst: ${esc(e.message)}</div></div>${linkGrid([{ name: 'Booking.com', note: 'hledání na tvoje data', url: baseSearchUrl(t, b, d) }], '#003580')}`;
      return;
    }
    if (T() !== t || t.step !== 'stay' || stayIdx !== i) return;
    staysData = data;
    if (absorbStayQuery(b, data)) persist();
    renderStays();
  }

  /** Dotaz na nabídky ubytování jednoho místa trasy: parametry pro api/stays a klíč mezipaměti. */
  function baseStayQuery(t, b, d) {
    const params = { city: b.name, country: b.country || '', cc: b.cc || '', checkin: d.checkin, checkout: d.checkout, adults: t.adults, lat: b.lat, lon: b.lon };
    if (b.nameEn) params.cityEn = b.nameEn; // odkazy na Booking, Airbnb… (český název „Boloňa“ by nenašly)
    // místo z hledání (ID GeoNames): bez anglického názvu ho server dohledá; podle ID najde i místo na TripAdvisoru
    if (b.gid) params.gid = b.gid;
    // Město příletu/odletu: letiště pomůže najít střed metropole a zemi.
    if (b.anchor === 'arrival') Object.assign(params, { iata: t.flight.out.to, country: b.country || t.dest.country || '', cc: b.cc || t.dest.cc || '' });
    else if (b.anchor === 'departure' && backLeg(t)) params.iata = tripAirports(t).departure;
    return { params, key: `${b.name}|${(+b.lat).toFixed(3)},${(+b.lon).toFixed(3)}|${d.checkin}|${d.checkout}|${t.adults}` };
  }

  /** Země a anglický název, které server dopočetl (místo přidané ručně) – pro odkazy ve shrnutí a vstupní podmínky. */
  function absorbStayQuery(b, data) {
    const dq = data.query || {};
    let changed = false;
    if (!b.cc && /^[A-Z]{2}$/.test(dq.cc || '')) { Object.assign(b, { cc: dq.cc, country: b.country || String(dq.country || '').slice(0, 60) }); changed = true; }
    if (!b.nameEn && typeof dq.cityEn === 'string' && dq.cityEn && dq.cityEn !== b.name) { b.nameEn = dq.cityEn.slice(0, 80); changed = true; }
    // Odkaz na hledání pro shrnutí (místo bez vybraného hotelu = „vyber přes odkaz“).
    if (data.links && data.links[0] && b.searchUrl !== data.links[0].url) { b.searchUrl = data.links[0].url; changed = true; }
    return changed;
  }

  /**
   * Vybraný hotel (karta h) → ubytování v cestě. url = hlavní odkaz karty (Xotelo: web nejlevnější nabídky) – „co
   * zarezervovat“ ve shrnutí vede tam, kde pokoj je; hotel bez ceny na tvoje dny: odhad z běžné ceny za noc (ve shrnutí
   * označený), ať celková cena cesty nechybí. Hotel z okolí (malé místo bez hotelů na TripAdvisoru): near = jeho místo.
   */
  function pickOf(h, nights) {
    const est = !h.priceTotalCzk && h.guess && h.nightFromCzk > 0 ? Math.round(h.nightFromCzk * (nights || 1)) : 0;
    return { mode: 'pick', id: h.id, name: h.name, totalCzk: h.priceTotalCzk || est, ...(est ? { est: true } : {}), url: h.bookUrl, lat: h.lat, lon: h.lon, rating: h.rating, provider: h.provider, ...(h.nearby && h.nearby.place ? { near: h.nearby.place } : {}) };
  }

  /** Nejlepší poměr ceny a hodnocení (value ze serveru) s cenou na tvoje dny – jako první karta při řazení „Nejlepší poměr“. */
  const bestStay = items => (items || []).filter(h => h.value != null && h.priceTotalCzk > 0).sort((a, b) => b.value - a.value)[0] || null;

  /**
   * „✨ Vyber za mě“: v každém místě trasy bez ubytování vybere hotel s nejlepším poměrem (postupně, ať se
   * nepřekročí limit dotazů). Místo, kde ceny nepřišly, zůstane nevybrané. Vrátí { ok, miss } (názvy míst).
   */
  let autoBusy = false; // „Vyber za mě“ běží – překreslený krok (jiná záložka) ho nespustí podruhé
  async function autoPickStays(t, onProgress = () => {}) {
    autoBusy = true; pickSeq++;
    try { return await autoPickRun(t, onProgress); } finally { autoBusy = false; }
  }
  async function autoPickRun(t, onProgress) {
    // noPrice = místa, kde TripAdvisor ceny nemá (jen ubytování z OpenStreetMap bez ceny) – vybere si uživatel sám
    const bs = t.route.bases, dates = baseDates(t), ok = [], miss = [], unsure = [], verified = [], noPrice = [];
    const todo = bs.map((b, i) => i).filter(i => !bs[i].stay);
    const qs = todo.map(i => (dates[i] && dates[i].nights >= 1 ? baseStayQuery(t, bs[i], dates[i]) : null));
    // další místo se načítá, zatímco se tady doptává na ceny a ověřuje volno (loadStays pak navrátí rozběhnutý dotaz);
    // ne souběžně s hledáním tohoto – dvě hledání naráz si dělí frontu na Xotelo a obě by stihla méně cen (živě 12/2026
    // 4 malá místa: první odpověď 3–4 hotely s cenou místo 5–10)
    const ahead = k => { const x = qs.slice(k).find(Boolean); if (x) loadStays(x.key, x.params).catch(() => {}); };
    for (const [k, i] of todo.entries()) {
      if (T() !== t) break; // mezitím jiná cesta nebo Začít znovu
      onProgress(k + 1, todo.length, bs[i].name);
      const b = bs[i], d = dates[i];
      if (!qs[k]) { miss.push(b.name); continue; }
      const { params, key } = qs[k];
      let h = null, osmOnly = false;
      try {
        let data = await loadStays(key, params);
        ahead(k + 1);
        // ceny hotelů se teprve doplňují (Xotelo) → jednou znovu, server dopočítá jen chybějící
        if (!bestStay(data.items) && staysIncomplete(data)) {
          await new Promise(res => setTimeout(res, 2000));
          staysRetry = key; data = await loadStays(key, params);
        }
        absorbStayQuery(b, data);
        osmOnly = Boolean(data.osmFallback);
        // stejně jako ruční Vybrat: volno se teď ověří (ceny v nabídce bývají až hodinu staré) – vyprodaný hotel se
        // přeskočí a vezme se další nejlepší (nejvýš 3 ověření na místo); bez odpovědi se vybere s „volno neověřené“
        const ranked = (data.items || []).filter(x => x.value != null && x.priceTotalCzk > 0 && !x.soldOut).sort((a, b2) => b2.value - a.value).slice(0, 3);
        for (const cand of ranked) {
          const r = await checkStay(data, cand, null);
          if (T() !== t) break;
          if (r && r.available === false) { cand.soldOut = true; continue; }
          if (r && r.available) { applyCheck(cand, r); verified.push(b.name); } else if (r) unsure.push(b.name);
          h = cand;
          break;
        }
      } catch (e) { staysRetry = null; }
      if (T() !== t) break;
      if (h && !b.stay) { b.stay = { ...pickOf(h, d.nights), checkin: d.checkin, checkout: d.checkout }; ok.push(b.name); } else if (!b.stay) (osmOnly ? noPrice : miss).push(b.name);
      persist();
    }
    return { ok, miss, unsure, verified, noPrice };
  }

  // Partnerský (affiliate) odkaz přes Travelpayouts – i uložený v cestě (vybraný hotel, odkaz ve shrnutí).
  const affUrl = u => /^https:\/\/tp\.media\//.test(String(u || ''));
  // Odkazy na partnery; affiliate odkazy viditelně označené (zákon o ochraně spotřebitele, rel=sponsored).
  const SPONSOR_NOTE = '<div class="faint" style="font-size:11.5px;margin-top:6px">Odkazy označené „reklama“ jsou partnerské (affiliate): při rezervaci přes ně může ATLAS dostat provizi. Cenu pro tebe to nezvyšuje a pořadí nabídek to neovlivňuje.</div>';
  // Barvy značek partnerů ubytování (jen podklad zkratky; neznámé id → barva skupiny).
  const BRAND = { booking: '#003580', 'booking-best': '#003580', airbnb: '#d93a5b', trip: '#287dfa', hotelscom: '#c8102e', kayak: '#d9480f', google: '#1a73e8', hostelworld: '#d4471c', agoda: '#5b3a9b' };
  /** Odkazy na partnery; compact = menší karty, na telefonu ve dvou sloupcích (ubytování má partnerů víc). */
  function linkGrid(links, color, compact = false) {
    const html = links.map(l => `<a class="result-link" href="${esc(safeUrl(l.url))}" target="_blank" rel="${l.sponsored ? 'sponsored nofollow noopener' : 'noopener'}"><div class="lg" style="background:${(compact && BRAND[l.id]) || color}">${esc(l.name.slice(0, 2))}</div><div class="rl-b"><div class="rl-t">${esc(l.name)}${l.sponsored ? ' <span class="ad-tag">reklama</span>' : ''}</div><div class="rl-s">${esc(l.note)}</div></div><div class="go">↗</div></a>`).join('');
    return `<div class="link-grid${compact ? ' compact' : ''}">${html}</div>${links.some(l => l.sponsored) ? SPONSOR_NOTE : ''}`;
  }

  /** Hodnocení na kartě: TripAdvisor (Xotelo) „4,5/5 (2 163 hodnocení)“, ostatní 0–10 „8,9 Vynikající · 2 100 recenzí“. */
  function stayRating(h) {
    if (h.rating == null) return { inline: '', col: '<div class="faint">bez hodnocení</div>' };
    if (h.rating5 != null) {
      const n = h.reviews ? `${h.reviews.toLocaleString('cs')} hodnocení` : '';
      const cnt = n && h.reviewsUrl ? `<a href="${esc(safeUrl(h.reviewsUrl))}" target="_blank" rel="noopener" title="Hodnocení hostů na TripAdvisoru">${n}</a>` : n;
      return {
        inline: `<div class="st-rate-inline"><b class="ta">${dec1(h.rating5)}/5</b> ${ratingWord5(h.rating5)}${cnt ? ` (${cnt})` : ''}</div>`,
        col: `<div class="rt ta">${dec1(h.rating5)}<small>/5</small></div><div class="faint">${ratingWord5(h.rating5)}${cnt ? `<br>${cnt}` : ''}<br>TripAdvisor</div>`,
      };
    }
    return {
      inline: `<div class="st-rate-inline"><b>${dec1(h.rating)}</b> ${ratingWord(h.rating)}${h.reviews ? ` · ${reviewsTxt(h.reviews)}` : ''}</div>`,
      col: `<div class="rt">${dec1(h.rating)}</div><div class="faint">${ratingWord(h.rating)}${h.reviews ? `<br>${reviewsTxt(h.reviews)}` : ''}</div>`,
    };
  }

  // Ceny u jednotlivých webů (Xotelo): „Agoda 3 240 Kč · Booking.com 3 560 Kč…“ – celkem za pobyt, nejlevnější první;
  // každá vede na hotel u svého webu, web bez spolehlivého odkazu (site null – Agoda, Vio, web hotelu…) na Google Hotels.
  // Trip.com hledá hotel podle názvu (searchWord) – výsledky ukáže až po potvrzení Hledat (links.js)
  const tripHint = u => /^https:\/\/www\.trip\.com\/hotels\/list\?searchWord=/.test(u || '') ? ' – na Trip.com potvrď Hledat' : '';
  const otaTitle = r => r.site ? `Hledání hotelu na ${r.name} na tvoje data${r.site === 'trip' ? ' – potvrď Hledat' : ''}` : `Google Hotels: živé ceny hotelu u všech webů na tvoje data (${r.name} nemá přímý odkaz)`;
  const outLink = (url, html, { cls = 'linkbtn', title = '', sponsored = false } = {}) => `<a class="${cls}" href="${esc(safeUrl(url))}" target="_blank" rel="${sponsored ? 'sponsored nofollow noopener' : 'noopener'}"${title ? ` title="${esc(title)}"` : ''}>${html}</a>`;
  const otaChips = h => Array.isArray(h.rates) && h.rates.length
    ? `<div class="st-otas">${h.rates.slice(0, 4).map((r, k) => {
      const t = `${r.name}: ${czk(r.totalCzk)} celkem, ${czk(r.perNightCzk)}/noc`, inner = `${esc(r.name)} <b>${czk(r.totalCzk)}</b>`, cls = `ota${k === 0 ? ' best' : ''}`;
      return r.url ? outLink(r.url, inner + (r.sponsored ? '<span class="ad-tag">reklama</span>' : ''), { cls, title: `${t} – ${otaTitle(r)}`, sponsored: r.sponsored }) : `<span class="${cls}" title="${esc(t)}">${inner}</span>`;
    }).join('')}</div>` : '';
  // Partnerský odkaz na kartě (hlavní, Booking.com u Xotela) – i v chipu ceny.
  const staySponsored = h => Boolean(h.bookUrl && h.bookSponsored) || (h.provider === 'xotelo' && (h.rates || []).some(r => r.url && r.sponsored));

  // hotel z okolí (malé místo bez hotelů na TripAdvisoru): „📍 v okolí: Noto · 24 km od Palazzolo Acreide“
  const nearLine = (h, base) => h.nearby ? `<div class="st-near">📍 v okolí${h.nearby.place ? `: <b>${esc(h.nearby.place)}</b>` : ''}${h.distanceKm != null ? ` · ${Math.round(h.distanceKm)} km od ${esc(base || 'místa pobytu')}` : ''}</div>` : '';
  function stayCard(h, i, base = '') {
    const cur = staySlot && staySlot.get();
    const chosen = cur && cur.mode === 'pick' && cur.id === h.id;
    const badges = (h.badges || []).map(b => STAY_BADGES[b] ? `<span class="b ${STAY_BADGES[b][1]}">${b === 'cheapest-good' && h.rating5 != null ? '💚 Nejlevnější s hodnocením 4+/5' : STAY_BADGES[b][0]}</span>` : '').join('');
    const rt = stayRating(h);
    // Xotelo: hlavní odkaz = web nejlevnější nabídky (bez spolehlivého odkazu „porovnat ceny“ na Google Hotels);
    // Booking.com zvlášť, jen když na tvoje dny něco nabízí – jinak poznámka, proč by tam hotel byl vyprodaný.
    const top = h.provider === 'xotelo' && Array.isArray(h.rates) && h.rates[0] && h.rates[0].url ? h.rates[0] : null;
    const bk = top && h.rates.find(r => r.site === 'booking');
    const bkLink = (url, label, title, sp) => `<span class="st-bk">${outLink(url, `${label} ↗`, { title, sponsored: sp })}${sp ? '<span class="ad-tag">reklama</span>' : ''}</span>`;
    const links = !h.bookUrl ? '' : top
      ? bkLink(h.bookUrl, top.site ? esc(top.name) : 'porovnat ceny', otaTitle(top), h.bookSponsored) + (bk && bk !== top ? bkLink(bk.url, 'Booking.com', otaTitle(bk), bk.sponsored) : '')
      : h.guess ? bkLink(h.bookUrl, 'ceny na tvoje dny', 'Google Hotels – ceny hotelu na tvoje dny u všech webů', false)
        // ubytování z OpenStreetMap (bez ceny): hledání u Bookingu na tvoje dny, vlastní web a mapa
        : h.osm ? bkLink(h.bookUrl, 'Booking.com', 'Hledání ubytování na Booking.com na tvoje dny – cenu a volno ověř tam', h.bookSponsored)
          + (h.website ? bkLink(h.website, 'web ubytování', 'Vlastní web ubytování (z OpenStreetMap)', false) : '')
          + (h.mapUrl ? bkLink(h.mapUrl, 'mapa', 'Ubytování na Google Mapách', false) : '')
          : bkLink(h.bookUrl, 'detail', '', h.bookSponsored);
    // hotel bez ceny na tvoje dny (TripAdvisor ji zatím nemá): běžné rozpětí za noc
    const guess = h.guess ? `<div class="pp-guess" title="${h.nightToCzk > h.nightFromCzk ? `běžně ${czk(h.nightFromCzk)}–${czk(h.nightToCzk)} za noc` : ''}">${h.nightFromCzk ? `od ~${czk(h.nightFromCzk)}/noc` : 'cena na webu'}</div><div class="faint">běžná cena · volno na tvoje dny neověřené</div>` : '';
    return `<div class="stay ${chosen ? 'chosen' : ''}">
      <div class="st-img" ${h.photo ? `style="background-image:url('${esc(cssUrl(h.photo))}')"` : ''}>${h.photo ? '' : '🏨'}</div>
      <div class="st-main">
        <div class="st-name">${esc(h.name)} <span class="st-stars">${stars(h.stars)}</span></div>
        <div class="faint" style="font-size:12.5px">${esc([h.typeLabel, h.address, h.distanceKm != null && !h.nearby ? `${dec1(h.distanceKm)} km od centra` : ''].filter(Boolean).join(' · '))}</div>
        ${nearLine(h, base)}${rt.inline}
        <div class="st-badges">${badges}${h.freeCancellation ? '<span class="b good">zdarma storno</span>' : ''}${h.breakfast ? '<span class="b">snídaně</span>' : ''}</div>
        ${otaChips(h)}${top && !bk ? '<div class="faint st-nobk">Booking.com na tvoje dny nic nenabízí</div>' : ''}${top && top.site === 'trip' ? '<div class="faint st-nobk">Trip.com: hledání potvrď tlačítkem Hledat</div>' : ''}
      </div>
      <div class="st-rating">${rt.col}</div>
      <div class="st-price"><div class="st-pp">${h.priceTotalCzk ? `<div class="pp">${czk(h.priceTotalCzk)}</div><div class="faint">celkem · ${czk(h.pricePerNightCzk)}/noc</div>` : guess || `<div class="faint">${h.osm ? 'cenu ověř u partnera' : 'cena na webu'}</div>`}</div>
        ${h.soldOut && !chosen ? '<div class="st-sold">❌ na tvoje dny vyprodáno</div>' : ''}
        <button class="btn sm ${h.soldOut && !chosen ? 'ghost' : 'primary'}" data-pick="${i}"${h.soldOut && !chosen ? ' data-anyway="1" title="Volno jsem ověřil teď – TripAdvisor na tvoje dny nic nenabízí"' : ''}>${chosen ? '✓ Vybráno' : h.soldOut ? 'Vybrat i tak' : 'Vybrat'}</button>
        ${links}</div>
    </div>`;
  }

  // „ (2 pokoje)“ – cena platí pro všechny pokoje
  const roomsTxt = d => { const r = d.query && d.query.rooms; return r > 1 ? ` (${r} ${r <= 4 ? 'pokoje' : 'pokojů'})` : ''; };
  // čas cen „14:05“ (čas zařízení), z jiného dne „10. 10. 14:05“
  const atTxt = ms => { const x = new Date(ms), hm = `${pad(x.getHours())}:${pad(x.getMinutes())}`; return x.toDateString() === new Date().toDateString() ? hm : `${x.getDate()}. ${x.getMonth() + 1}. ${hm}`; };

  /**
   * ↻ Aktualizovat ceny: nabídky zůstanou na obrazovce, dokud nepřijdou nové (fresh=1 – server zjistí ceny znovu, hotely,
   * které se mezitím vyprodaly, zmizí); nepovede-li se to (výpadek sítě na telefonu, 429), zůstanou dřívější s poznámkou
   * a tlačítkem znovu. Mezitím jiná cesta, krok, místo trasy nebo dotaz (jiné noci) → nic nepřekreslí.
   */
  async function freshStays(d) {
    const t = T(), i = stayIdx;
    staysUpd = { key: d.key, run: true };
    renderStays();
    let nd = null, fail = null;
    try { nd = await loadStays(d.key, d.params, { fresh: true }); } catch (e) { fail = String((e && e.message) || ''); }
    if (staysUpd && staysUpd.key === d.key) staysUpd = nd ? null : { key: d.key, fail };
    if (nd && staysData && staysData.key === d.key) staysData = nd; // i když je uživatel jinde – po návratu nové ceny
    if (T() !== t || t.step !== 'stay' || stayIdx !== i || !staysData || staysData.key !== d.key) return;
    // vybraný hotel: cena v cestě (Vybráno, hlavička, Shrnutí) podle aktualizované nabídky, ne ta z výběru
    syncPicked(nd);
    renderStays();
  }
  // vybraný hotel: cena v cestě (Vybráno, hlavička, Shrnutí) podle nové nabídky, ne ta z výběru – i hotel vybraný
  // s odhadem, ke kterému cena na tvoje dny mezitím přišla (odhad tím končí)
  function syncPicked(nd) {
    const cur = staySlot && staySlot.get(), h = nd && cur && cur.mode === 'pick' && nd.items.find(x => x.id === cur.id);
    if (!h || !h.priceTotalCzk || (h.priceTotalCzk === cur.totalCzk && !cur.est)) return;
    const { est, ...rest } = cur;
    staySlot.set({ ...rest, totalCzk: h.priceTotalCzk, url: h.bookUrl || cur.url });
    persist(); refreshHead();
    const c = $('#tripStep .chosen'); if (c) c.innerHTML = `Vybráno: <b>${esc(cur.name || '')}</b> · ${czk(h.priceTotalCzk)} <span class="faint">(aktualizováno)</span>`;
  }

  // Neúplné ceny (Xotelo nestihl všechny hotely do rozpočtu, nebo sám nestihl TripAdvisor – u termínu, na který se zatím
  // nikdo neptal, běžné; co se jednou podaří, má uložené): průvodce se sám doptá na zbytek – hotové ceny má server
  // v mezipaměti, takže další dotaz jen dotáhne chybějící (živě 10/2026 Krakov: 0 → 0 → 1 → 3 hotely). Nejvýš 5× za sebou
  // na místo a termín, seznam se doplní na místě (filtry a řazení zůstanou); pak zůstane „↻ Zkusit znovu“.
  const STAY_FILL = 5;
  let stayFill = { key: '', n: 0 };
  function stayAutoFill(d) {
    if (d.filling) return true;
    if (!(d.providers || []).some(p => p.ok && p.partial)) return false;
    if (stayFill.key !== d.key) stayFill = { key: d.key, n: 0 };
    if (stayFill.n >= STAY_FILL) return false;
    stayFill.n++;
    d.filling = true;
    setTimeout(async () => {
      let nd = null;
      try { staysRetry = d.key; nd = await loadStays(d.key, d.params); } catch (e) { staysRetry = null; }
      d.filling = false;
      const t = T();
      if (!t || t.step !== 'stay' || staysData !== d) return; // mezitím jiné místo, termín nebo krok
      if (nd) { staysData = nd; syncPicked(nd); } else stayFill.n = STAY_FILL; // chyba: už nezkoušet, nabídnout Zkusit znovu
      renderStays();
    }, 2000);
    return true;
  }
  function renderStays() {
    const host = $('#stayBody'); if (!host || !staysData) return;
    const d = staysData;
    const filling = stayAutoFill(d);
    if (!filling) warmStays(T()); // místo má nabídky → další místa trasy dopředu
    const fillTxt = ' <span class="st-upd"><span class="spin dark"></span> Doplňuji ceny dalších hotelů…</span>';
    const types = [...new Set(d.items.map(h => h.type).filter(Boolean))];
    // typ zapamatovaný z jiného místa nebo cesty, který tu není (výběr by ho ani neukázal) – bez filtru
    if (stayView.type && !types.includes(stayView.type)) stayView.type = '';
    // malé místo bez hotelů na TripAdvisoru: hotely s cenou z okolí (nearbyFrom) a pod nimi ubytování v místě bez ceny
    // (OpenStreetMap) zvlášť – filtr ceny a hodnocení se na ně nevztahuje (nemají je), typ ano
    const near = d.nearbyFrom && d.nearbyFrom.length ? d.nearbyFrom : null;
    const isOsm = h => h.provider === 'osm';
    const split = Boolean(near) && d.items.some(isOsm) && d.items.some(h => !isOsm(h));
    const main = split ? d.items.filter(h => !isOsm(h)) : d.items;
    const inTown = split ? d.items.filter(h => isOsm(h) && (!stayView.type || h.type === stayView.type)) : [];
    // bez hodnocení u žádného (ubytování z OpenStreetMap) filtr hodnocení z jiného místa neplatí
    let items = main.filter(h => (h.rating ?? 0) >= stayView.minRating || stayView.minRating === 0 || !main.some(x => x.rating != null))
      .filter(h => !stayView.maxNight || ((h.pricePerNightCzk || h.nightFromCzk) && (h.pricePerNightCzk || h.nightFromCzk) <= stayView.maxNight))
      .filter(h => !stayView.type || h.type === stayView.type);
    const sorters = {
      value: (a, b) => (b.value ?? -1) - (a.value ?? -1),
      price: (a, b) => (a.priceTotalCzk || Infinity) - (b.priceTotalCzk || Infinity),
      rating: (a, b) => (b.adjRating ?? -1) - (a.adjRating ?? -1),
      dist: (a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity),
    };
    items = [...items].sort(sorters[stayView.sort]);
    // hotely bez ceny na tvoje dny (často vyprodané) až na požádání, když je s cenou aspoň pár jiných; vyprodané dozadu
    // „Ukázat i hotely bez ceny“ platí jen pro tohle místo a termín (stayView.guess = klíč dotazu), další místo začne skryté
    const nGuess = items.filter(h => h.guess).length, hideGuess = stayView.guess !== d.key && nGuess > 0 && items.length - nGuess >= 3;
    if (hideGuess) items = items.filter(h => !h.guess);
    // vyprodaný (ověřeno při výběru) zůstane vidět tam, kde se na něj klepnulo – jen dostane štítek a „Vybrat i tak“
    const links = linkGrid(d.links, '#003580', true);
    const errs = d.providers.filter(p => !p.ok).map(p => `${esc(p.name)}: ${esc(p.error)}`).join(' · ');
    // „Zkusit znovu“: neúplný výsledek (ceny nestihly přijít) nebo chyba zdroje – nový dotaz bez mezipaměti prohlížeče
    const retryBtn = staysIncomplete(d) ? ' <button type="button" class="linkbtn" id="stayRetry">↻ Zkusit znovu</button>' : '';
    const wireRetry = () => {
      const b = $('#stayRetry'); if (b) b.onclick = () => { staysRetry = d.key; staysCache.delete(d.key); staysData = null; stayStep(); };
      const f = $('#stayFresh'); if (f) f.onclick = () => freshStays(d);
    };
    if (!d.items.length) {
      // zdroj cen selhal (výpadek, odmítá dotazy…) ≠ místo bez nabídek; nestihly-li ceny přijít, řekni to
      const failed = d.providers.length > 0 && d.providers.every(p => !p.ok);
      const late = d.providers.some(p => p.ok && p.partial);
      const head = failed ? `Ceny hotelů ${d.providers.some(p => p.id === 'xotelo') ? 'z TripAdvisoru ' : ''}teď nejdou načíst – vyber si u partnerů,`
        : late && filling ? 'Ceny hotelů ještě přicházejí – chvilku vydrž, nebo si vyber u partnerů,'
        : late ? 'Ceny hotelů nestihly přijít – zkus to za chvíli znovu, nebo si vyber u partnerů,'
          : d.providers.length ? 'Pro toto místo a termín nemám přímé nabídky – otevři si hledání u partnerů,' : 'Vyber si ubytování u partnerů –';
      host.innerHTML = `<div class="note ${failed ? 'warn' : 'info'}">${failed ? '⚠️' : 'ℹ️'} <div>${head} většina hledání je už <b>předvyplněná na tvoje data</b> (u označených „zadej data“ zadáš termín na webu). Až si vybereš, zadej cenu níže.${errs ? `<br><span class="faint">${errs}</span>` : ''}${filling ? fillTxt : retryBtn}${!d.providers.length && window.showSetupGuide ? ` <a href="#" id="stayGuide" class="faint">Hotely s cenou přímo tady (volitelné) →</a>` : ''}</div></div>${links}`;
      const g = $('#stayGuide'); if (g) g.onclick = e => { e.preventDefault(); window.showSetupGuide('guideStays'); };
      wireRetry();
      return;
    }
    const testNote = d.providers.some(p => p.ok && p.test && p.count) ? `<div class="note warn" style="margin-bottom:10px">⚠️ <div><b>Ukázková / testovací nabídka</b> – hotely a ceny nejsou skutečné (demo režim nebo testovací klíč LiteAPI). Skutečné ceny ověř přes odkazy na partnery dole.</div></div>` : '';
    // Xotelo: zdroj poctivě – orientační ceny z TripAdvisoru, rezervuje se u partnera; z kdy jsou (nejstarší z hotelů)
    // a „Aktualizovat ceny“ (server nejvýš jednou za 5 min – jinak refreshIn), bez daní u všech nabídek poznámka o poplatcích
    const xo = d.providers.find(p => p.id === 'xotelo' && p.ok && (p.count || p.guesses));
    // čas cen (nejstarší) a poplatky jen z hotelů, které filtry ukazují – skrytý hotel se staršími cenami nevadí
    const xoItems = items.filter(h => h.provider === 'xotelo' && !h.guess);
    const at = Math.min(...xoItems.map(h => +h.ratesAt || Infinity));
    const noTax = xoItems.length > 0 && xoItems.every(h => (h.rates || []).slice(0, 4).every(r => !r.tax));
    const wait = xo && xo.refreshIn ? Math.ceil((d.got + xo.refreshIn * 1e3 - Date.now()) / 60e3) : 0;
    const upd = staysUpd && staysUpd.key === d.key ? staysUpd : null, fail = upd && upd.fail != null;
    const failTxt = fail ? ` <b>Aktualizace se nepovedla</b>${upd.fail ? `: ${esc(upd.fail.replace(/[.!]$/, ''))}` : ''}.${at < Infinity ? ` Ceny jsou z ${atTxt(at)}.` : ' Ceny zůstaly dřívější.'}` : '';
    const again = !xo ? '' : xo.partial ? (filling ? fillTxt : ` U některých hotelů ceny nestihly přijít – zkus to za chvíli znovu.${retryBtn}`)
      : upd && upd.run ? ' <span class="st-upd"><span class="spin dark"></span> Aktualizuji ceny…</span>'
      : `${fail ? failTxt : xo.staleAll ? ' Ceny se teď aktualizovat nepodařilo, zůstaly dřívější.' : xo.stale ? ' Část cen se teď aktualizovat nepodařilo, zůstaly dřívější.' : ''}${wait > 0 && !fail ? ` Ceny se aktualizovaly před chvílí – znovu to půjde za ${wait} min.` : ' <button type="button" class="linkbtn" id="stayFresh" title="Zjistit ceny znovu – hotely, které se mezitím vyprodaly, zmizí">↻ Aktualizovat ceny</button>'}`;
    // krátce nahoře (zdroj, čas, aktualizace), podrobnosti o cenách po rozkliknutí – ať hotely začínají hned pod tím
    const srcNote = xo ? `<div class="note info st-src" style="margin-bottom:10px">ℹ️ <div><b>Ceny: TripAdvisor</b> za celý pobyt${roomsTxt(d)} – orientační, ověř u partnera.${at < Infinity && !fail ? ` Ceny z ${atTxt(at)}.` : ''}${again}
      <details class="st-more"><summary>Odkud ceny jsou</summary>Cena je nejlevnější nabídka z Booking, Agoda, Trip.com…, hodnocení hostů z TripAdvisoru (0–5).${items.some(h => h.guess) ? ' U hotelů s „od ~…/noc“ TripAdvisor cenu na tvoje dny nemá – bývají obsazené, je to jen běžná cena.' : ''}${noTax ? ' Cena bez místních poplatků (např. městská taxa), pokud je web neuvádí.' : ''}</details></div></div>` : '';
    // malé místo, kde TripAdvisor nic nemá: ceny z míst v okolí (Noto ~21 km), ubytování v místě z OpenStreetMap (bez ceny
    // a hodnocení)
    const base = (d.query && d.query.city) || '';
    const nearTxt = near ? near.map(x => `${esc(x.name || 'okolí')} ~${x.km} km`).join(', ') : '';
    const osmNote = near ? `<div class="note info st-src" style="margin-bottom:10px">ℹ️ <div><b>${base ? `${esc(base)} TripAdvisor nemá` : 'TripAdvisor tu hotely nemá'}</b> – ceny jsou z okolí (${nearTxt}).${split ? ' V místě jsou i ubytování bez ceny (OpenStreetMap) níže.' : ''}</div></div>`
      : d.osmFallback ? `<div class="note info st-src" style="margin-bottom:10px">ℹ️ <div><b>TripAdvisor tu ceny nemá</b> – v místě jsou tato ubytování (OpenStreetMap). Cenu ověř u partnera a zadej ji níže.</div></div>` : '';
    // stupnice filtru podle zdroje: TripAdvisor 0–5 (3,5+ / 4+ / 4,5+ = 7+ / 8+ / 9+ na stupnici 0–10); bez hodnocení (OSM) bez filtru
    const five = main.length > 0 && main.every(h => h.rating5 != null), rated = main.some(h => h.rating != null);
    // ubytování v místě bez ceny: nejdřív 3, zbytek na požádání (jen pro tohle místo a termín)
    const osmLim = stayView.osm === d.key ? inTown.length : 3;
    const townHtml = inTown.length ? `<div class="st-town"><h4>🏡 V místě${base ? ` – ${esc(base)}` : ''} (bez ceny)</h4><div class="faint" style="font-size:12px;margin-bottom:8px">Ubytování z OpenStreetMap – cenu a volno ověř u partnera a zadej ji níže.</div>
        <div class="stay-list">${inTown.slice(0, osmLim).map(h => stayCard(h, d.items.indexOf(h), base)).join('')}</div>
        ${inTown.length > osmLim ? `<button type="button" class="more-btn" id="stayTownN">▼ Další v místě (${inTown.length - osmLim})</button>` : ''}</div>` : '';
    // nejdřív 6 hotelů (na telefonu je každý ~200 px) – „Ubytování neřeším“ a vlastní cena jsou pak blízko
    const lim = stayView.n || 6;
    host.innerHTML = `${testNote}${osmNote}${srcNote}<div class="stay-tools">
        <select id="staySort">${[['value', '🏆 Nejlepší poměr cena/hodnocení'], ['price', '💰 Nejlevnější'], ['rating', '⭐ Nejlépe hodnocené'], ['dist', '📍 Nejblíž centru']].map(o => `<option value="${o[0]}" ${stayView.sort === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select>
        ${rated ? `<div class="seg" id="stayMin">${[[0, 'vše'], [7, five ? '3,5+' : '7+'], [8, five ? '4+' : '8+'], [9, five ? '4,5+' : '9+']].map(o => `<button type="button" data-v="${o[0]}" class="${stayView.minRating === o[0] ? 'on' : ''}">${o[1]}</button>`).join('')}</div>` : ''}
        ${types.length > 1 ? `<select id="stayType"><option value="">všechny typy</option>${types.map(x => `<option ${stayView.type === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>` : ''}
        <input class="input" id="stayMax" type="number" min="0" step="100" placeholder="max Kč/noc" value="${stayView.maxNight || ''}" style="max-width:130px">
        <span class="faint" style="font-size:12px">${items.length} z ${main.length} nabídek${hideGuess ? ` · ${nGuess} bez ceny skryto` : ''}${split ? ` · ${inTown.length} v místě bez ceny` : ''}</span>
      </div>
      <div class="stay-list">${items.slice(0, lim).map((h) => stayCard(h, d.items.indexOf(h), base)).join('') || '<div class="empty">Filtrům nic neodpovídá.</div>'}</div>
      ${items.length > lim ? `<button type="button" class="more-btn" id="stayMoreN">▼ Další hotely (${items.length - lim})</button>` : ''}
      ${hideGuess ? `<button type="button" class="linkbtn st-guess-btn" id="stayGuess">Ukázat i ${nGuess} ${nGuess === 1 ? 'hotel' : nGuess <= 4 ? 'hotely' : 'hotelů'} bez ceny na tvoje dny (často obsazené)</button>` : ''}
      ${townHtml}
      ${items.some(staySponsored) || inTown.some(staySponsored) ? SPONSOR_NOTE : ''}
      ${errs ? `<div class="faint" style="font-size:12px;margin-top:6px">${errs}${xo ? '' : retryBtn}</div>` : ''}
      <details class="more" style="margin-top:12px"><summary>Další nabídky u partnerů</summary>${links}</details>`;
    wireRetry();
    // změna řazení nebo filtru: zase od prvních 6
    $('#staySort').onchange = e => { stayView.sort = e.target.value; stayView.n = 0; renderStays(); };
    $$('#stayMin button').forEach(b => b.onclick = () => { stayView.minRating = +b.dataset.v; stayView.n = 0; renderStays(); });
    const ty = $('#stayType'); if (ty) ty.onchange = e => { stayView.type = e.target.value; stayView.n = 0; renderStays(); };
    $('#stayMax').onchange = e => { stayView.maxNight = +e.target.value || null; stayView.n = 0; renderStays(); };
    const mn = $('#stayMoreN'); if (mn) mn.onclick = () => { stayView.n = lim + 10; renderStays(); };
    const tn = $('#stayTownN'); if (tn) tn.onclick = () => { stayView.osm = d.key; renderStays(); };
    // hotely bez ceny jsou v pořadí až za limitem výpisu – ukázat celý seznam a posunout se k prvnímu z nich
    const sg = $('#stayGuess'); if (sg) sg.onclick = () => {
      stayView.guess = d.key; stayView.n = Math.max(lim, d.items.length); renderStays();
      const g = $('.pp-guess', host); if (g && g.scrollIntoView) g.scrollIntoView({ block: 'center', behavior: 'smooth' });
    };
    const doPick = h => { pickSeq++; staySlot.set(pickOf(h, d.query && d.query.nights)); persist(); staySlot.next(); };
    $$('[data-pick]', host).forEach(b => b.onclick = async () => {
      const h = d.items[+b.dataset.pick], cur = staySlot && staySlot.get();
      if (b.dataset.anyway || (cur && cur.mode === 'pick' && cur.id === h.id)) return doPick(h);
      const seq = ++pickSeq, slot = staySlot;
      const r = await checkStay(d, h, b);
      // mezitím jiné místo, krok nebo dotaz, nebo jiná volba (další hotel, jen odkazy, vlastní) – platí ta pozdější
      if (staysData !== d || seq !== pickSeq || slot !== staySlot || T().step !== 'stay') return;
      if (r && r.available === false) {
        h.soldOut = true; renderStays();
        toast(`${h.name}: na tvoje dny už nic nenabízí – nejspíš vyprodáno. Vyber jiný.`, 'err', 7000);
        return;
      }
      if (r && r.available) {
        const was = h.priceTotalCzk;
        applyCheck(h, r);
        const top = (r.rates || [])[0];
        toast(`✓ Volno ověřeno teď${top ? ` – ${top.name} ${czk(r.priceTotalCzk)}` : ''}${was && was !== r.priceTotalCzk ? ` (dřív ${czk(was)})` : ''}`, '', 4000);
      } else if (r) toast('Volno se teď ověřit nepovedlo – před rezervací ho zkontroluj na webu.', 'info', 5000);
      doPick(h);
    });
  }

  /**
   * Volno hotelu z TripAdvisoru (Xotelo) teď, než se vybere: ceny v nabídce můžou být až hodinu staré a hotel se mezitím
   * vyprodá (na Bookingu pak „není k dispozici“). → { available: true (+ nové ceny) | false | null } nebo null (jiný zdroj,
   * chyba sítě, limit – vybere se bez ověření). Tlačítko mezitím „Ověřuji volno…“.
   */
  // ověřené volno: nová cena a weby s cenou na tvoje dny
  const applyCheck = (h, r) => Object.assign(h, { priceTotalCzk: r.priceTotalCzk, pricePerNightCzk: r.pricePerNightCzk, rates: r.rates, ratesAt: r.ratesAt, bookUrl: r.bookUrl, bookSponsored: r.bookSponsored, guess: false, checkedAt: r.at || Date.now() });
  async function checkStay(d, h, btn) {
    const m = /^xo:(g\d+-d\d+)$/.exec(h.id || '');
    if (!m || h.provider !== 'xotelo' || !d.params) return null;
    const txt = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Ověřuji volno…'; }
    try {
      // hotel z okolí: odkazy na weby hledají hotel v jeho místě (near), ne v místě pobytu
      const r = await fetch('api/stays/check?' + new URLSearchParams({ ...d.params, hotel: m[1], name: h.name, ...(h.nearby && h.nearby.city ? { near: h.nearby.city } : {}) }));
      return r.ok ? await r.json() : { available: null };
    } catch (e) {
      return { available: null };
    } finally { if (btn) { btn.disabled = false; btn.innerHTML = txt; } }
  }

  /* ---------- auto ---------- */
  function carDefaults(t) {
    // cesta přes víc měst letadlem: auto v prvním místě (vrácení před dalším letem), jinde si ho zadáš sám
    if (isFly(t)) {
      const o = t.flight.out, n = midLegs(t)[0];
      return { pickup: o.to, dropoff: n.from, from: shiftDt(arrivalAt(o), 45), to: n.hasTime ? shiftDt(n.dep.slice(0, 16), -120) : `${n.date}T10:00` };
    }
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
    if (isFly(t)) {
      return `<div class="note info" style="margin-bottom:12px">✈️ <div><b>Mezi místy letíš</b> (${esc(r.bases.map(b => b.name).join(' → '))}) – auto na celou cestu nedává smysl.
        Půjč si ho jen tam, kde ho chceš (níž je předvyplněné ${esc(r.bases[0].name)} do dalšího letu), nebo:
        <div style="margin-top:8px"><button type="button" class="btn sm primary" id="carSkipTop">Auto nepotřebuji →</button></div></div></div>`;
    }
    if (r.transport === 'transit') {
      const dates = baseDates(t);
      const xs = r.bases.slice(1).map((b, i) => r.transfers && r.transfers[i]);
      const rows = r.bases.slice(1).map((b, i) => {
        const x = xs[i];
        return `<div>${dayLbl(dates[i].checkout)} · ${esc(r.bases[i].name)} → ${esc(b.name)}${x ? ` · ${trIcon('transit', x)} ~${minutesToHm(x.transitMin)} ${kindTxt(x)} (${estTxt(x, 'transit')}) · <a href="${esc(safeUrl(x.transitUrl))}" target="_blank" rel="noopener">ověř spoje v Google Maps ↗</a>` : ''}</div>`;
      }).join('');
      const bus = xs.length && xs.every(x => x && x.transitKind === 'bus');
      return `<div class="note info" style="margin-bottom:12px">${bus ? '🚌' : '🚆'} <div><b>Mezi místy pojedeš ${bus ? 'autobusem nebo minibusem' : 'vlakem nebo autobusem'}</b> – auto nepotřebuješ (půjčit si ho můžeš i jen na pár dní).
        <div class="rt-trains">${rows}</div><div style="font-size:12px">Čas je odhad${xs.some(x => x && x.fast) ? ' (u přímého vlaku podle jízdního řádu)' : ''} – skutečné spoje ukáže odkaz; jízdenky koupíš ${bus ? 'na autobusovém nádraží nebo u dopravce' : 'u národního dopravce nebo na nádraží'}.</div></div></div>`;
    }
    // s vlakem/busem místo letu se jede z města příjezdu (ne z letiště)
    const ends = ovOn(t) ? overlandLegs(t) : r.legs || {};
    const km = [ends.arrival, ...(r.transfers || []), ends.departure].reduce((s, x) => s + (x ? x.km : 0), 0);
    const pu = f.out.to, back = f.back ? f.back.from : null;
    if (ovOn(t)) {
      return `<div class="note info" style="margin-bottom:12px">🧭 <div><b>Trasa autem: ${esc(r.bases.map(b => b.name).join(' → '))}</b>${km ? ` · přejezdy celkem ~${km} km` : ''}.<br>
        Přijedeš vlakem / busem – auto si půjč na místě (třeba na letišti <b>${esc(pu)}</b> – ${esc(t.overland.to.label)}) a vrať ho tam před cestou zpět.</div></div>`;
    }
    return `<div class="note info" style="margin-bottom:12px">🧭 <div><b>Trasa autem: ${esc(r.bases.map(b => b.name).join(' → '))}</b>${km ? ` · přejezdy celkem ~${km} km` : ''}.<br>
      ${back ? `Auto vyzvedni na letišti příletu <b>${esc(pu)}</b> a vrať na letišti odletu <b>${esc(back)}</b>${back !== pu ? ' – jednosměrný pronájem (one-way) bývá dražší, příplatek za vrácení jinde ověř ve srovnávači' : ''}.` : `Auto vyzvedni na letišti příletu <b>${esc(pu)}</b>; místo vrácení zadej podle toho, kde cestu končíš.`}</div></div>`;
  }

  async function carStep() {
    const t = T();
    const host = $('#tripStep');
    const def = t.car && t.car.mode !== 'skip' && t.car.from ? t.car : carDefaults(t);
    // délka pronájmu a příplatek za vrácení jinde – i po úpravě letišť a časů
    const daysLine = q => `${daysTxt(Math.max(1, Math.ceil((new Date(q.to + ':00Z') - new Date(q.from + ':00Z')) / 864e5) || 1))} pronájmu${q.dropoff && q.dropoff !== q.pickup ? ` · vrácení na jiném letišti (${esc(q.dropoff)}) může stát příplatek` : ''}`;
    const byTrain = isMulti(t) && t.route.transport === 'transit';
    // trasa přes víc míst autem a auto zatím nevybrané: bez auta jde přejet vlakem a busem (Auto nepotřebuji by nechalo
    // přejezdy autem – palivo i časy za auto, které nebude)
    const byCar = isMulti(t) && !byTrain && (!t.car || t.car.mode === 'skip');
    host.innerHTML = `<div class="card step-card">
      <div class="sc-head"><div><h3>🚗 Auto na místě</h3><div class="muted">${ovOn(t) ? `Půjčovny bývají na letišti u cíle (${esc(t.flight.out.to)}) – vyzvednutí po příjezdu, vrácení před cestou zpět.` : 'Vyzvednutí na letišti po příletu, vrácení před odletem.'}</div></div>
      ${t.car ? `<div class="chosen">${t.car.mode === 'skip' ? 'Bez auta' : `Auto: <b>${czk(t.car.totalCzk)}</b>`}</div>` : ''}</div>
      ${routeCarNote(t)}
      ${!isMulti(t) && !t.car ? '<div class="car-quick"><span class="muted">Na místě se obejdeš bez auta?</span><button type="button" class="btn sm" id="carSkipTop">Auto nepotřebuji →</button></div>' : ''}
      <div class="car-form">
        <div class="field"><label>Vyzvednutí</label><div class="row" style="gap:6px"><input class="input" id="carPu" value="${esc(def.pickup)}" maxlength="3" style="max-width:80px;text-transform:uppercase"><input class="input" type="datetime-local" id="carFrom" value="${def.from}"></div></div>
        <div class="field"><label>Vrácení</label><div class="row" style="gap:6px"><input class="input" id="carDo" value="${esc(def.dropoff)}" maxlength="3" style="max-width:80px;text-transform:uppercase"><input class="input" type="datetime-local" id="carTo" value="${def.to}"></div></div>
        <div class="field"><label>Věk řidiče</label><input class="input" type="number" id="carAge" min="18" max="99" value="${def.age || 30}" style="max-width:90px"></div>
      </div>
      <div class="faint" style="font-size:12.5px;margin:6px 0 12px" id="carDays">${daysLine(def)}</div>
      <div id="carBody"><div class="loading-row"><span class="spin dark"></span> Připravuji nabídky…</div></div>
      <div class="divider"></div>
      <div class="manual-row"><div class="muted" style="font-size:13px">Vybral sis auto? Zadej celkovou cenu:</div>
        <input class="input" id="carPrice" type="number" min="0" step="100" placeholder="Cena celkem v Kč" value="${t.car && t.car.mode === 'manual' ? t.car.totalCzk : ''}">
        <button class="btn" id="carSave">Uložit</button></div>
      <div class="row wrap" style="gap:8px;margin-top:14px"><button class="btn ${(byTrain || isFly(t)) && !t.car ? 'primary' : 'ghost'}" id="carSkip">Auto nepotřebuji →</button>${byCar ? '<button class="btn ghost" id="carTransit" title="Přejezdy mezi místy trasy se přepočítají na vlak a autobus (jízdenky místo paliva)">Bez auta – mezi místy vlakem a busem →</button>' : ''}${t.car ? '<button class="btn primary" id="carNext">Pokračovat →</button>' : ''}</div>
    </div>`;
    const read = () => ({ pickup: $('#carPu').value.trim().toUpperCase(), dropoff: $('#carDo').value.trim().toUpperCase(), from: $('#carFrom').value, to: $('#carTo').value, age: +$('#carAge').value || 30 });
    const linkFor = carLinkFor;
    const load = async () => {
      const q = read();
      if (q.from && q.to) $('#carDays').innerHTML = daysLine(q);
      if (!/^[A-Z]{3}$/.test(q.pickup) || !q.from || !q.to) return;
      try {
        const r = await fetch('api/cars?' + new URLSearchParams({ pickup: q.pickup, dropoff: q.dropoff || q.pickup, from: q.from, to: q.to, age: q.age }));
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
        carsData = j;
        // uložené auto bez odkazu („Pokračovat“ dřív, než se nabídky k novým časům načetly) ho dostane teď
        if (t.car && t.car.mode === 'manual' && !t.car.url && linkFor(t.car)) { t.car.url = linkFor(t.car); persist(); }
        if (!$('#carBody')) return; // krok Auto už je pryč
        $('#carBody').innerHTML = `<div class="muted" style="font-size:13px;margin-bottom:8px">Srovnávače půjčoven – <b>předvyplněné na letiště ${esc(j.query.pickupName || q.pickup)} a tvoje časy</b>:</div>
          ${linkGrid(j.links, '#ff690f')}`;
      } catch (e) {
        if ($('#carBody')) $('#carBody').innerHTML = `<div class="note warn">⚠️ <div>${esc(e.message)}</div></div>`;
      }
    };
    ['#carPu', '#carDo', '#carFrom', '#carTo', '#carAge'].forEach(s => $(s).onchange = load);
    $('#carSave').onclick = () => {
      const price = +$('#carPrice').value;
      if (!(price > 0)) return toast('Zadej cenu auta', 'err');
      const q = read();
      t.car = { mode: 'manual', totalCzk: price, ...q, url: linkFor(q) };
      persist(); setStep('program');
    };
    $('#carSkip').onclick = () => { t.car = { mode: 'skip', totalCzk: 0 }; persist(); setStep('program'); };
    const st = $('#carSkipTop'); if (st) st.onclick = $('#carSkip').onclick; // hned nahoře (jinak je až pod srovnávači půjčoven)
    const ct = $('#carTransit'); if (ct) ct.onclick = () => {
      // přejezdy mají časy i jízdné pro obojí – přepočet ze serveru (dlouhé přejezdy, cesta z letiště) doběhne na pozadí
      t.route.transport = 'transit'; t.car = { mode: 'skip', totalCzk: 0 };
      persist(); refreshTransfers({ keep: true }); setStep('program');
    };
    const nx = $('#carNext'); if (nx) nx.onclick = () => {
      // upravená letiště a časy u zadané ceny platí i bez „Uložit“ (průběh cesty, kalendář, plánovač)
      const q = read(), c = t.car;
      if (c && c.mode === 'manual' && /^[A-Z]{3}$/.test(q.pickup) && q.from && q.to
        && (['pickup', 'dropoff', 'from', 'to'].some(k => (c[k] || '') !== q[k]) || (c.age || 30) !== q.age)) {
        // i odkaz do shrnutí (ten uložený vede na srovnávač se starými časy)
        Object.assign(c, q, { url: linkFor(q) }); persist(); toast('Změny auta uloženy – zkontroluj, jestli cena platí');
      }
      setStep('program');
    };
    load();
  }

  /* ---------- program ---------- */
  // Čas „HH:MM“ + minuty (zaokrouhleno na čtvrthodiny nahoru, nejpozději 19:00).
  const addHm = (hm, min) => {
    const m = Math.min(19 * 60, Math.ceil((+hm.slice(0, 2) * 60 + +hm.slice(3, 5) + min) / 15) * 15);
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  };
  // „HH:MM“ − minuty (zaokrouhleno na čtvrthodiny dolů, nejdřív 00:00)
  const subHm = (hm, min) => {
    const m = Math.max(0, Math.floor((+hm.slice(0, 2) * 60 + +hm.slice(3, 5) - min) / 15) * 15);
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  };
  const CHECKOUT_HM = '11:00'; // den přejezdu: dopoledne ještě na místě, odjezd kolem 11:00

  /**
   * Kdy nejpozději vyrazit na letiště (odhad, ne jízdní řád): z domu na let tam (cesta na letiště z hledání) a z ubytování
   * na let zpět (cesta z města na letiště, u trasy přes víc míst z posledního místa) – 2 h před odletem, mimo Schengen
   * 2,5 h. → { home, hotel }, každé null nebo { date, hm, min (cesta na letiště), airport, before, hint }. Domov a letiště
   * odletu jsou ve stejném časovém pásmu. Vlakem/busem místo letu nic; s autem vráceným na letišti čas dává vrácení auta.
   */
  const CITY_STOP_MIN = 20; // z ubytování na zastávku letištního busu / vlaku a čekání na spoj
  function leaveBy(t) {
    if (!t || !t.flight || !t.flight.out || ovOn(t)) return { home: null, hotel: null };
    const f = t.flight, bases = (isMulti(t) && t.route.bases) || [];
    // let tam míří do země cíle, zpět odlétá ze země posledního místa trasy – mimo Schengen o půl hodiny dřív
    const beforeOf = cc => (window.SearchHelp ? SearchHelp.beforeFor(cc) : 120);
    const at = (l, min, cc) => { const before = beforeOf(cc), dt = shiftTz(l.dep, -(before + min), l.fromTz); return { date: dt.slice(0, 10), hm: dt.slice(11, 16), min, airport: l.from, before, hint: null }; };
    const destCc = t.dest && t.dest.cc, backCc = (bases.length && bases[bases.length - 1].cc) || destCc;
    // minuty z cizího odkazu (#trip=) jen jako rozumné číslo
    const okMin = v => { const n = Number(v); return Number.isFinite(n) && n > 0 && n < 1440 ? Math.round(n) : 0; };
    const gm = okMin(t.ground && t.ground.out && t.ground.out.minutes);
    // tabulka cesty z letiště do města (arrival) má jen jízdu: k ní cesta z ubytování na zastávku a čekání na spoj
    // (přejezdy trasy z transfers.js je už v sobě mají)
    const tab = v => { const n = okMin(v); return n > 0 ? n + CITY_STOP_MIN : 0; };
    let hotel = null;
    if (f.back && f.back.hasTime && !carCovers(t, 'back')) {
      // trasa podle letů: poslední místo je ve městě letiště odletu → cesta z města na letiště jako u jednoho místa
      const lg = isFly(t) ? gapLeg(t, gapAt(t, t.route.bases.length - 1)) : null;
      const m = isMulti(t) && !isFly(t) ? okMin(legMin((t.route.legs || {}).departure, t.route.transport)) : lg ? okMin(lg.transitMin) : tab(t.arrival && t.arrival.back && t.arrival.back.min);
      // jedno místo, ale zpět z letiště jiného města (víc měst v hledání): cesta z města toho letiště se k ubytování nehodí
      const sameCity = isMulti(t) || f.back.from === f.out.to || !(t.arrival && t.arrival.out && t.arrival.back) || t.arrival.out.city === t.arrival.back.city;
      if (m > 0 && sameCity) {
        hotel = at(f.back, m, backCc);
        // výlet bez noci (návrat týž den): žádné ubytování ani check-out
        hotel.noStay = stayDates(t).nights < 1;
        // noční let (z ubytování už předchozí večer) bez rady
        const day = hotel.date === f.back.date;
        hotel.hint = hotel.noStay ? null : day && hotel.hm > CHECKOUT_HM ? `check-out bývá do ${CHECKOUT_HM} – zavazadla nech na recepci` : day && hotel.hm < '06:00' ? 'brzy ráno – taxi objednej předem, nebo přespi u letiště' : null;
      }
    }
    // cesta přes víc měst: z ubytování na let do dalšího místa (cesta z města na letiště z hledání)
    const mids = isFly(t) ? midLegs(t).map((l, i) => {
      const a = t.arrival && Array.isArray(t.arrival.mid) && t.arrival.mid[i] && t.arrival.mid[i].from, gx = gapLeg(t, gapAt(t, i));
      const m = gx ? okMin(gx.transitMin) : tab(a && a.min);
      if (!l.hasTime || !(m > 0)) return null;
      const x = at(l, m, bases[i] && bases[i].cc), day = x.date === l.date;
      x.hint = day && x.hm > CHECKOUT_HM ? `check-out bývá do ${CHECKOUT_HM} – zavazadla nech na recepci` : day && x.hm < '06:00' ? 'brzy ráno – taxi objednej předem, nebo přespi u letiště' : null;
      return x;
    }) : [];
    // z domu na letiště ve tvém městě před 4:30 (MHD ještě nejede): taxi – čas autem ze serveru (nightMin)
    let home = f.out.hasTime && gm > 0 ? at(f.out, gm, destCc) : null;
    const g0 = t.ground && t.ground.out, nm = okMin(g0 && g0.local && g0.mode !== 'car' && g0.nightMin);
    if (home && nm && nm < gm && home.hm < '04:30') home = { ...at(f.out, nm, destCc), taxi: true };
    return { home, hotel, mids };
  }
  // „ve 2:40“ / „v 1:35“ a „2 h“ / „2,5 h“ před odletem k leaveBy
  const lbTime = x => `${window.SearchHelp ? SearchHelp.ve(+x.hm.slice(0, 2) * 60 + +x.hm.slice(3, 5)) : 'v'} ${+x.hm.slice(0, 2)}${x.hm.slice(2)}`;
  const lbBefore = x => (x.before > 120 ? '2,5 h' : '2 h');

  /** Termín programu místa trasy: den příletu / přejezdu a čas příjezdu, den odjezdu a odlet. */
  function baseProgram(t, i) {
    const r = t.route, d = baseDates(t)[i], last = i === r.bases.length - 1, b = backLeg(t);
    if (isFly(t)) {
      // trasa podle letů: od příletu do místa (rezervu na cestu z letiště má program sám) do odletu dalšího letu
      const a = arrivalAt(i ? midLegs(t)[i - 1] : t.flight.out), n = last ? b : midLegs(t)[i];
      return { start: a.slice(0, 10), end: d.checkout, arrivalTime: a.slice(11, 16), departureTime: n && n.hasTime ? n.dep.slice(11, 16) : null };
    }
    const arr = arrivalAt(outLeg(t)), a0 = arr.slice(11, 16);
    // Cesta z letiště (města příjezdu) na 1. místo a z posledního zpět: hodinu kryje rezerva programu
    // (1,5 h po příletu, 3 h před odletem), co je navíc, ubere z prvního a posledního dne.
    const ends = ovOn(t) ? overlandLegs(t) : r.legs || {};
    const inMin = Math.max(0, (legMin(ends.arrival, r.transport) || 0) - 60), outMin = Math.max(0, (legMin(ends.departure, r.transport) || 0) - 60);
    return {
      start: i === 0 ? arr.slice(0, 10) : d.checkin, end: d.checkout,
      arrivalTime: i === 0 ? (inMin ? [a0, addHm(a0, inMin)].sort()[1] : a0) : addHm(CHECKOUT_HM, legMin(r.transfers && r.transfers[i - 1], r.transport) || 120),
      // dayCapacities končí program 3 h před „odletem“ → odjezd v 11:00 = program do 11:00
      departureTime: last ? (b && b.hasTime ? subHm(b.dep.slice(11, 16), outMin) : null) : addHm(CHECKOUT_HM, 180),
    };
  }

  /** Příjezd a odjezd místa v nadpisu programu: přejezdy odhadem (odjezd po check-outu), u trasy podle letů přílet a odlet. */
  function flyHead(t, i, p, last) {
    if (!isFly(t)) return `${i ? ` · příjezd ~${p.arrivalTime}` : ''}${last ? '' : ` · odjezd ~${CHECKOUT_HM}`}`;
    const a = i ? midLegs(t)[i - 1] : null, d = last ? null : midLegs(t)[i];
    return `${a ? ` · přílet ${a.hasTime ? p.arrivalTime : '(čas ověř)'}` : ''}${d ? ` · odlet ${d.hasTime ? depHm(d) : '(čas ověř)'} ${esc(d.from)}` : ''}`;
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
      <h3 class="base-h" style="font-size:15.5px;margin:14px 0 2px">${i + 1}. ${esc(b.name)} <span class="muted" style="font-weight:600;font-size:13px">· ${dayLbl(p.start)} – ${dayLbl(p.end)}${flyHead(t, i, p, last)}</span></h3>
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
    const span = progSpan(t), progStart = span.start;
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
    host.innerHTML = `<div class="card step-card"><div class="sc-head"><div><h3>🗺️ Co dělat · ${esc(t.dest.label)}</h3>
      <div class="muted">Návrh programu na ${daysTxt(progDays)}${t.stay && t.stay.lat != null ? ' kolem tvého ubytování' : ''} – můžeš ho upravit.</div></div></div>
      <div id="tripPlaces"></div>
      <div class="row wrap" style="gap:8px;margin-top:14px"><button class="btn primary" id="progNext">Pokračovat ke shrnutí →</button></div></div>`;
    $('#progNext').onclick = () => setStep('summary');
    if (window.Places && center.lat != null) {
      Places.renderPlanner($('#tripPlaces'), {
        lat: center.lat, lon: center.lon, label: center.label || t.dest.label, city: t.cityCenter ? t.cityCenter.label : t.dest.label.replace(/ \(.*\)$/, ''), country: t.dest.country || '', cc: t.dest.cc,
        ...span, plan: t.plan, // termín a časy jako tripPlan (shrnutí, kalendář, plánovač)
        onPlan: plan => { T().plan = plan; persist(); },
      });
    } else {
      $('#tripPlaces').innerHTML = '<div class="note info">ℹ️ <div>Pro tuto destinaci neznám souřadnice – program nejde navrhnout.</div></div>';
    }
  }

  /* ---------- průběh cesty ---------- */
  // „Ryanair · FR 1234 · 1× přestup (FRA 1 h 35 min)“ – číslo letu ukazují tabule na letišti
  const legWho = l => esc([l.carrierName, l.flightNo, stopsTxt(l)].filter(Boolean).join(' · '));
  // Ryanair / Wizz Air: kdy se otevře online check-in (bez místenky 24 h před odletem) – na letišti se za odbavení platí
  const checkinRow = (l, c) => [c.open.slice(0, 10), '📲', `Online check-in ${esc(c.airline)} ${esc(l.from)} → ${esc(l.to)}: otevře se ${fmtDate(c.open.slice(0, 10))} v ${c.open.slice(11, 16)} (24 h před odletem), zavře ${c.closeH} h před odletem · na letišti se platí ~${esc(c.fee)}/os.`];
  // aktivity dnů z plánovače ({ den: [text] }; u cesty z průvodce jen ty přidané v plánovači – 📝)
  const ownRows = (rows, own, ico = '📝') => Object.keys(own || {}).sort().forEach(d => { const a = (Array.isArray(own[d]) ? own[d] : []).filter(x => typeof x === 'string' && x); if (/^\d{4}-\d{2}-\d{2}$/.test(d) && a.length) rows.push([d, ico, a.map(esc).join(' · ')]); });
  /** Aktivita programu, jak ji průvodce uloží do plánovače („Místo: název – poznámka“, u jednoho místa bez místa). */
  const actTxt = (place, x) => (place ? `${place}: ` : '') + x.name + (x.note ? ` – ${x.note}` : '');
  // den programu bez aktivit smazaných či přejmenovaných v plánovači (drop: { den: [text z plánovače] }); cesta
  // z průvodce prošla sanitizeTrip, který z textů vyhodí <>"'` (karta apostrofy nechá), a plán ze zálohy má místo ' ’ –
  // porovnává se bez nich
  const cutQ = s => String(s).replace(/[<>"'`’]/g, '');
  const progDay = (d, place, drop) => { const g = drop && Array.isArray(drop[d.date]) ? drop[d.date].map(cutQ) : null; return g ? { ...d, items: d.items.filter(x => !g.includes(cutQ(actTxt(place, x)))) } : d; };
  /**
   * Průběh cesty po dnech [[den YYYY-MM-DD, ikona, html, { plan, day }?]] seřazený podle dne – shrnutí průvodce i karta
   * „📍 Dnes na cestě“ (app.js) z jednoho místa, ať se nerozejdou. Řádek programu nese i den a program (trasa pěšky).
   * Cesta z průvodce (t.flight.out), nebo jen z plánovače: lety t.legs / vlak t.ground (tvar legBrief / groundBrief) a
   * aktivity t.days. o.own = aktivity přidané v plánovači k cestě z průvodce, o.drop = aktivity průvodce v plánovači
   * smazané nebo přejmenované (z programu dne pryč, i z trasy pěšky).
   */
  function timeline(t, o = {}) {
    if (!(t.flight && t.flight.out)) return planTimeline(t);
    const f = t.flight, { checkin } = stayDates(t);
    const multi = isMulti(t), r = t.route, dates = multi ? baseDates(t) : [], fly = isFly(t), mid = midLegs(t);
    const ov = ovOn(t) ? t.overland : null;
    const rows = [], lb = leaveBy(t);
    // z ubytování na letiště: před cestou na letiště (večer předchozího dne až po programu)
    const hotelRow = x => x && rows.push([x.date + (x.date < f.back.date ? '~' : ''), '🚪', `${x.noStay ? 'Z města' : 'Z ubytování'} na letiště ${esc(x.airport)} vyraž nejpozději ${lbTime(x)} <span class="faint">(~${minutesToHm(x.min)} cesta + ${lbBefore(x)} před odletem, odhad)</span>${x.hint ? ' · ' + esc(x.hint) : ''}`]);
    // cesta na letiště v den, kdy se z ubytování vyráží (odlet po půlnoci → už předchozí večer, po řádku 🚪), v noci
    // (vyrážíš před 5:00 nebo po 23:00) MHD a letištní vlaky obvykle nejezdí
    const legDay = (x, l) => (x && x.date < l.date ? x.date + '~' : l.date);
    // u letišť, kde už počítáme taxi (Hurghada, Djerba…), nic – odhad ceny je tam taxi; u letišť s pevnou cenou taxi
    // (Řím, Paříž…) úsek v noci (k = klíč z nightTaxis, i přílet) taxi za pevnou cenu, v odhadu ceny započtené
    const nts = nightTaxis(t), ntOf = k => (k ? nts.find(n => n.key === k) : null);
    const nightTxt = (x, mode, k) => (ntOf(k) ? taxiTxt(ntOf(k).a) : mode !== 'taxi' && x && (x.hm < '05:00' || x.hm >= '23:00') ? ' · v noci spíš taxi (v odhadu ceny je MHD)' : '');
    const gRow = (g, a, b) => `${esc(a)} → ${esc(b)} · ${esc(gTime(g))} · ${esc(gKind(g))}${g.fromStation ? ` · ${esc(g.fromStation)} → ${esc(g.toStation)}` : ''} (${esc(gWho(g))})`;
    // let bez času (cena z mezipaměti): ne vymyšlená půlnoc, ale „čas ověř“ jako u cesty z plánovače
    const fRow = l => (l.hasTime ? `${esc(l.from)} ${hhmm(l.dep)} → ${esc(l.to)} ${arrHm(l)} · ${legWho(l)}` : `${esc(l.from)} → ${esc(l.to)} · ${[legWho(l), 'čas ověř'].filter(Boolean).join(' · ')}`);
    if (ov) rows.push([ov.out.date, gIco(ov.out), gRow(ov.out, ov.from.label, ov.to.label)]);
    else {
      // autem i čím jede: „Autem na letiště PRG (nafta, ~45 min, odhad)“, „Elektroautem na letiště …“
      const gl = groundLines(t), home = lb.home;
      // vyrazit z domu: večer předchozího dne až po ostatním (online check-in)
      if (home) rows.push([home.date + (home.date < f.out.date ? '~' : ''), '🚪', `Vyraž z domu nejpozději ${lbTime(home)} <span class="faint">(~${minutesToHm(home.min)} ${home.taxi ? 'taxi ' : ''}na letiště ${esc(home.airport)} + ${lbBefore(home)} před odletem, odhad)</span>`]);
      // brzy ráno z letiště ve tvém městě taxi (čas autem), ne denní MHD – stejně jako řádek 🚪 nad tím
      if (gl.out) rows.push(home && home.taxi ? [f.out.date, '🚕', esc(`Taxi na letiště ${f.out.from} (~${minutesToHm(home.min)}, v noci MHD nejede – objednej předem; v ceně cesty je MHD, odhad)`)] : [f.out.date, gl.icon, esc(gl.out)]);
      // z letiště domů až po přistání (dálkový let zpět přistane i další den)
      if (gl.back) rows.push([arrivalAt(f.back).slice(0, 10) + '~', gl.icon, esc(gl.back)]);
      rows.push([f.out.date, '🛫', fRow(f.out)]);
      // z letiště do města (jedno místo pobytu a trasa podle letů; u trasy přes víc míst je to přejezd na 1. místo) – ne s autem z letiště
      const ao = (!multi || fly) && t.arrival && t.arrival.out;
      if (ao && !carCovers(t, 'out')) rows.push([arrivalAt(f.out).slice(0, 10), ARR_ICO[ao.mode] || '🚌', esc(arrivalRow(ao) + nightTxt(null, null, 'out'))]);
    }
    if (t.car && t.car.mode !== 'skip' && t.car.from) rows.push([t.car.from.slice(0, 10), '🚗', `Vyzvednutí auta ${esc(t.car.pickup)} ${t.car.from.slice(11, 16)}`]);
    if (multi) {
      // Pořadí v rámci dne přejezdu: dopoledne program, přejezd, ubytování a program na dalším místě.
      const tr = r.transport, legs = r.legs || {}, ovl = ov ? overlandLegs(t) : null;
      if (!ov && legs.arrival && legs.arrival.km >= 1) rows.push([arrivalAt(f.out).slice(0, 10), trIcon(tr, legs.arrival), `Z letiště ${esc(f.out.to)} → ${esc(r.bases[0].name)} · ${legTxt(legs.arrival, tr)} (${estTxt(legs.arrival, tr)})${esc(borderTxt(legs.arrival))}${esc(arrivalFareTxt(t, 'out', r.bases[0], tr) + nightTxt(null, null, 'out'))}`]);
      if (ovl && ovl.arrival && ovl.arrival.km >= 1) rows.push([ov.out.date, trIcon(tr, ovl.arrival), `${esc(ov.to.label)} → ${esc(r.bases[0].name)} · ${legTxt(ovl.arrival, tr)} (${estTxt(ovl.arrival, tr)})${esc(borderTxt(ovl.arrival))}`]);
      r.bases.forEach((b, i) => {
        rows.push([dates[i].checkin, '🏨', `<b>${esc(b.name)}</b> · ${nightsTxt(b.nights)} · ${esc(hotelName(b.stay) || (b.stay && b.stay.mode === 'skip' ? 'ubytování neřeším' : 'ubytování zatím nevybráno'))}`]);
        // den cesty bez programu (přílet pozdě večer, odjezd ráno) jako v kroku Program – bez řádku „volno“
        const bp = basePlan(t, i);
        for (const d of (bp?.days || []).map(y => progDay(y, b.name, o.drop))) if (d.items.length || d.cap) rows.push([d.date, '📍', `${esc(b.name)}: ${d.items.map(x => esc(x.name)).join(' · ') || 'volno'}`, { plan: bp, day: d }]);
        const x = r.transfers && r.transfers[i];
        // trasa podle letů: mezi místy let – vyrazit z ubytování, na letiště, let, z letiště do dalšího města
        if (fly && mid[i]) {
          const am = (t.arrival && Array.isArray(t.arrival.mid) && t.arrival.mid[i]) || {}, lx = lb.mids && lb.mids[i];
          if (lx) rows.push([lx.date + (lx.date < mid[i].date ? '~' : ''), '🚪', `Z ubytování na letiště ${esc(lx.airport)} vyraž nejpozději ${lbTime(lx)} <span class="faint">(~${minutesToHm(lx.min)} cesta + ${lbBefore(lx)} před odletem, odhad)</span>${lx.hint ? ' · ' + esc(lx.hint) : ''}`]);
          const gx = gapLeg(t, gapAt(t, i));
          if (gx) rows.push([legDay(lx, mid[i]), trIcon('transit', gx), `${esc(b.name)} → letiště ${esc(mid[i].from)} · ${legTxt(gx, 'transit')} (${estTxt(gx, 'transit')})${nightTxt(lx)}${legLink(gx, 'transit') ? ` · ${legLink(gx, 'transit')}` : ''}`]);
          else if (am.from) rows.push([legDay(lx, mid[i]), ARR_ICO[am.from.mode] || '🚌', esc(arrivalRow(am.from, true) + nightTxt(lx, am.from.mode, `from${i}`))]);
          rows.push([mid[i].date, '✈️', `${fRow(mid[i])} · ${esc(b.name)} → ${esc(r.bases[i + 1].name)}`]);
          if (am.to) rows.push([arrivalAt(mid[i]).slice(0, 10), ARR_ICO[am.to.mode] || '🚌', esc(arrivalRow(am.to) + nightTxt(null, null, `to${i}`))]);
        } else if (i < r.bases.length - 1) rows.push([dates[i].checkout, trIcon(tr, x), `Přejezd ${esc(b.name)} → ${esc(r.bases[i + 1].name)}${x ? ` · ${legTxt(x, tr)} (${estTxt(x, tr)})${esc(borderTxt(x))}${legLink(x, tr) ? ` · ${legLink(x, tr)}` : ''}` : ''}`]);
      });
      ownRows(rows, o.own);
      hotelRow(lb.hotel);
      if (!ov && f.back && legs.departure && legs.departure.km >= 1) rows.push([legDay(lb.hotel, f.back), trIcon(tr, legs.departure), `${esc(r.bases.at(-1).name)} → letiště ${esc(f.back.from)} · ${legTxt(legs.departure, tr)} (${estTxt(legs.departure, tr)})${tr === 'transit' ? esc(nightTxt(lb.hotel, null, 'back')) : ''}${esc(borderTxt(legs.departure))}${esc(arrivalFareTxt(t, 'back', r.bases.at(-1), tr))}`]);
      if (ovl && ovl.departure && ovl.departure.km >= 1) rows.push([ov.back.date, trIcon(tr, ovl.departure), `${esc(r.bases.at(-1).name)} → ${esc(ov.to.label)} · ${legTxt(ovl.departure, tr)} (${estTxt(ovl.departure, tr)})${esc(borderTxt(ovl.departure))}`]);
    } else {
      if (t.stay && t.stay.mode !== 'skip') rows.push([checkin, '🏨', `Ubytování: ${esc(t.stay.name || '')}`]);
      const tp = tripPlan(t);
      for (const d of (tp?.days || []).map(y => progDay(y, null, o.drop))) if (d.items.length || d.cap) rows.push([d.date, '📍', d.items.map(x => esc(x.name)).join(' · ') || 'volný den', { plan: tp, day: d }]);
      ownRows(rows, o.own);
    }
    if (t.car && t.car.mode !== 'skip' && t.car.to) rows.push([t.car.to.slice(0, 10), '🚗', `Vrácení auta ${esc(t.car.dropoff)} ${t.car.to.slice(11, 16)}`]);
    if (!multi) hotelRow(lb.hotel);
    const ab = !ov && (!multi || fly) && f.back && t.arrival && t.arrival.back;
    const lg = fly ? gapLeg(t, gapAt(t, r.bases.length - 1)) : null;
    if (lg) rows.push([legDay(lb.hotel, f.back), trIcon('transit', lg), `${esc(r.bases.at(-1).name)} → letiště ${esc(f.back.from)} · ${legTxt(lg, 'transit')} (${estTxt(lg, 'transit')})${nightTxt(lb.hotel)}${legLink(lg, 'transit') ? ` · ${legLink(lg, 'transit')}` : ''}`]);
    else if (ab && !carCovers(t, 'back')) rows.push([legDay(lb.hotel, f.back), ARR_ICO[ab.mode] || '🚌', esc(arrivalRow(ab, true) + nightTxt(lb.hotel, ab.mode, 'back'))]);
    if (ov) { if (ov.back) rows.push([ov.back.date, gIco(ov.back), gRow(ov.back, ov.to.label, ov.from.label)]); }
    else if (f.back) rows.push([f.back.date, '🛬', fRow(f.back)]);
    // Stabilní řazení podle data; „~“ za datem = až po ostatních položkách dne.
    if (!ov) for (const l of allLegs(t)) {
      const c = l.hasTime && Ics.checkin({ carrier: l.carrier || l.carrierName, dep: l.dep, fromTz: l.fromTz });
      if (c) rows.push(checkinRow(l, c));
    }
    rows.sort((a, b) => a[0].localeCompare(b[0]));
    for (const x of rows) x[0] = x[0].replace('~', '');
    return rows;
  }
  /** Kde cesta z průvodce v den ymd je: místo, kde se ten den spí (u trasy přes víc míst; v den odjezdu poslední), a jeho
   *  ubytování → { name, hotel ('' bez vybraného), city, country }. */
  function placeOn(t, ymd) {
    if (isMulti(t)) {
      const ds = baseDates(t), k = ds.findIndex(d => ymd < d.checkout), b = t.route.bases[k < 0 ? ds.length - 1 : k];
      return { name: b.name, hotel: hotelName(b.stay), city: (b.stay && b.stay.mode === 'pick' && b.stay.near) || b.name, country: b.country || '' };
    }
    const name = ovOn(t) ? t.overland.to.label : t.dest.label;
    return { name, hotel: hotelName(t.stay), city: (t.stay && t.stay.mode === 'pick' && t.stay.near) || (t.cityCenter && t.cityCenter.label) || name, country: t.dest.country || '' };
  }
  /** Spoj last je cesta zpět: končí, kde spoj first začal – stejné letiště / město, nebo aspoň stejná časová zóna (návrat
   *  na jiné letiště u domova, BRQ místo PRG). Víc měst jen tam (PRG → FCO, FCO → BCN) ne. Spoje ve tvaru legBrief / groundBrief. */
  function legBack(first, last) {
    if (!first || !last || first === last) return false;
    const n = v => String(v || '').trim().toLowerCase();
    return (n(last.to) !== '' && n(last.to) === n(first.from)) || Boolean(last.toTz && last.toTz === first.fromTz);
  }
  /** Průběh cesty jen z plánovače: lety (t.legs) a vlak / bus (t.ground) s časy, online check-in a aktivity dnů (t.days). */
  function planTimeline(t) {
    const ok = v => (Array.isArray(v) ? v.filter(x => x && typeof x === 'object' && /^\d{4}-\d{2}-\d{2}$/.test(x.date || '')) : []);
    const legs = ok(t.legs), gs = ok(t.ground), rows = [];
    const fl = l => `${esc(l.from)}${l.dep ? ' ' + hhmm(l.dep) : ''} → ${esc(l.to)}${l.dep && l.arr ? ` ${l.arrEst ? '~' : ''}${hhmm(l.arr)}${plusDay(l.date, l.arr)}` : ''}`;
    const legRow = (l, ico) => {
      const who = legWho({ carrierName: l.carrier, flightNo: l.flightNo });
      rows.push([l.date, ico, `${fl(l)}${who ? ' · ' + who : ''}${l.dep ? '' : ' · čas ověř'}`]);
      const c = l.dep && Ics.checkin({ carrier: l.carrier, dep: l.dep, fromTz: l.fromTz });
      if (c) rows.push(checkinRow(l, c));
    };
    const gRow = g => rows.push([g.date, g.kind === 'bus' ? '🚌' : '🚆', `${fl(g)} · ${esc(g.kind || 'vlak / bus')}${g.dep ? '' : g.min ? ` · ~${minutesToHm(g.min)}, čas ověř` : ' · čas ověř'}${g.fromStation ? ` · ${esc(g.fromStation)} → ${esc(g.toStation)}` : ''}${g.carrier ? ` (${esc(g.carrier)})` : ''}`]);
    // tam (a mezi městy) před aktivitami dne, zpět až po nich – zpět je jen poslední spoj, který končí tam, kde cesta
    // začala (Víc měst jen tam: PRG → FCO → BCN je i poslední let „✈️“ před programem dne)
    const back = legs.length > 1 && legBack(legs[0], legs.at(-1)) ? legs.at(-1) : null, gBack = gs.length > 1 && legBack(gs[0], gs.at(-1)) ? gs.at(-1) : null;
    legs.forEach((l, i) => l !== back && legRow(l, i ? '✈️' : '🛫'));
    gs.forEach(g => g !== gBack && gRow(g));
    ownRows(rows, t.days, '📍');
    if (back) legRow(back, '🛬');
    if (gBack) gRow(gBack);
    return rows.sort((a, b) => a[0].localeCompare(b[0]));
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
      ov ? ['🚆', `Vlak / bus ${ov.back ? 'tam i zpět' : 'tam'} (${t.adults} os.)${[ov.out, ov.back].some(g => g && g.source !== 'regiojet') ? ' – odhad' : [ov.out, ov.back].some(g => g && g.demo) ? ' – DEMO' : ''}`, c.overland]
        : ['✈️', `Letenky (${t.adults} os.)${f.liveMin ? ` – ⚠️ cena z mezipaměti, živě od ${czk(f.liveMin)}/os.` : ''}`, c.flights, priceAgeHtml(t, 'sumAge')],
      c.bags ? ['🧳', 'Zavazadla (odhad příplatku)', c.bags] : null,
      c.ground ? [groundLines(t).icon, groundLines(t).row, c.ground] : null,
      // v noci taxi s pevnou cenou místo MHD: „… (odhad) · taxi na letiště FCO (noc) 55 € za auto“
      c.arrival ? [ARR_ICO[(t.arrival && t.arrival.out && t.arrival.out.mode) || 'bus'] || '🚌', `Doprava ${arrivalWhat(t)} (odhad)${nightTaxis(t).length ? ` · ${taxiWhat(nightTaxis(t))}` : ''}`, c.arrival] : null,
      ...(multi ? [
        ...r.bases.map(b => stayCzk(b.stay) ? ['🏨', `Ubytování · ${b.name} · ${nightsTxt(b.nights)}${hotelName(b.stay) ? ' · ' + hotelName(b.stay) + nearOf(b.stay) : ''}${b.stay.est ? ' (odhad – ověř cenu)' : ''}`, stayCzk(b.stay)] : null),
        unpriced.length ? ['🏨', `Ubytování zatím bez ceny · ${unpriced.join(', ')}`, null] : null,
      ] : [t.stay && t.stay.mode !== 'skip' ? ['🏨', `Ubytování · ${nightsTxt(nights)}${t.stay.name ? ' · ' + t.stay.name : ''}${t.stay.est ? ' (odhad – ověř cenu)' : ''}`, c.stay] : null]),
      t.car && t.car.mode !== 'skip' ? ['🚗', 'Auto', c.car] : null,
      c.transfers ? (r.transport === 'transit' ? ['🚆', `Přejezdy na trase – jízdenky (${t.adults} os., odhad)`, c.transfers] : ['⛽', `Přejezdy autem – palivo${[...(r.transfers || []), ...Object.values(ovOn(t) ? overlandLegs(t) : r.legs || {})].some(x => x && x.tollCzk) ? ' a mýtné' : ''} (odhad, nafta 6 l/100 km)`, c.transfers]) : null,
    ].filter(Boolean);
    // vstupní poplatky (ESTA, e-vízum…): zvlášť pod součtem, do „Celkem“ se nezapočítávají – platí se mimo cestu
    const isos = tripCountries(t), via = tripVia(t);
    const fees = window.Entry && Entry.ready() ? Entry.costs(isos, t.adults, via) : [];
    const feeCzk = fees.reduce((s, x) => s + x.czk, 0);
    const provLabel = p => ({ kiwi: 'Kiwi.com', travelpayouts: 'Aviasales', ryanair: 'Ryanair', wizzair: 'Wizz Air' })[p] || p;
    // Ryanair a Wizz Air účtují v měně země odletu (let zpět z Itálie v eurech) – předem říct v čem a kolik
    const curTxt = l => {
      if (!l || !/^[A-Z]{3}$/.test(l.siteCur || '') || l.siteCur === 'CZK') return '';
      if (!(l.sitePrice > 0)) return ` – web ukáže cenu v ${l.siteCur}`;
      let p; try { p = new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: l.siteCur, maximumFractionDigits: l.sitePrice >= 100 ? 0 : 2 }).format(l.sitePrice); } catch (e) { p = `${Math.round(l.sitePrice)} ${l.siteCur}`; }
      return ` – web ukáže cenu v ${l.siteCur}, ~${p}/os.`;
    };
    const fly = isFly(t);
    const flightLinks = f.bookUrl ? [[f.combined ? `Koupit letenky (${provLabel(f.provider)})` : 'Koupit letenky', f.bookUrl]]
      // cesta přes víc měst: každý let je samostatná letenka
      : fly ? allLegs(t).map(l => [`Letenka ${l.from} → ${l.to} ${fmtDate(l.date)} (${l.carrierName || l.provider})${curTxt(l)}`, l.bookUrl])
      : [[`Letenka tam (${f.out.carrierName || f.out.provider})${curTxt(f.out)}`, f.out.bookUrl], ...(f.back ? [[`Letenka zpět (${f.back.carrierName || f.back.provider})${curTxt(f.back)}`, f.back.bookUrl]] : [])];
    // Vlak/bus: jízdenka tam a zpět (RegioJet u vybraného spoje, jinak první odkaz – RegioJet, FlixBus, IDOS).
    const groundSteps = ov ? [[ov.out, 'tam', ov.from.label, ov.to.label, ov.links && ov.links.out], [ov.back, 'zpět', ov.to.label, ov.from.label, ov.links && ov.links.back]]
      .filter(x => x[0]).map(([g, what, a, b, links], i) => ({ id: `ground${i}:${g.date}`, label: `Jízdenka ${what}: ${a} → ${b} (${fmtDate(g.date)}${g.dep ? ' ' + hhmm(g.dep) : ''}${g.source === 'regiojet' ? ', ' + gWho(g) : ''})`, url: gUrl(g, links) })) : null;
    const steps = [
      ...(groundSteps || flightLinks.map(([label, url], i) => ({ id: 'flight' + i, label, url }))),
      ...(multi ? r.bases.map((b, i) => b.stay && b.stay.mode === 'skip' ? null : {
        id: stayBookId(b, dates[i]), label: `Ubytování ${b.name} (${fmtDate(dates[i].checkin)}–${fmtDate(dates[i].checkout)})${hotelName(b.stay) ? ': ' + hotelName(b.stay) : ' – vyber přes odkaz'}${b.stay && b.stay.mode === 'pick' ? tripHint(b.stay.url) : ''}`,
        url: (b.stay && b.stay.mode === 'pick' && b.stay.url) || baseSearchUrl(t, b, dates[i]),
      }) : [t.stay && t.stay.mode !== 'skip' ? { id: 'stay', label: `Ubytování${t.stay.name ? ': ' + t.stay.name : ''}${tripHint(t.stay.url)}`, url: t.stay.url || (staysData && staysData.key === stayKeyOf(t) && staysData.links[0]?.url) || stayFallbackUrl(t) } : null]),
      // odkaz na půjčovnu uložený s cenou auta (po znovuotevření aplikace nebo ve sdílené cestě už načtené nabídky nejsou)
      t.car && t.car.mode !== 'skip' ? { id: 'car', label: 'Auto', url: t.car.url || carLinkFor(t.car) } : null,
    ].filter(Boolean);
    const tl = timeline(t);
    host.innerHTML = `<div class="sum-grid">
      <div class="card step-card"><h3>🧾 Cena cesty</h3>
        <table class="cost">${rows.map(r => `<tr><td>${r[0]}</td><td>${esc(r[1])}${r[3] || ''}</td><td>${czk(r[2])}</td></tr>`).join('')}
        <tr class="tot"><td></td><td>Celkem</td><td>${czk(c.total)}</td></tr><tr><td></td><td class="faint">na osobu</td><td class="faint">${czk(c.perPerson)}</td></tr>
        ${fees.map(x => `<tr class="entry-fee"><td>🛂</td><td>${esc(x.label)} <span class="faint">– vstupní poplatek, orientačně</span></td><td>+ ${czk(x.czk)}</td></tr>`).join('')}
        ${fees.length ? `<tr class="entry-tot"><td></td><td>Celkem i se vstupními poplatky</td><td>${czk(c.total + feeCzk)}</td></tr>` : ''}</table>
        <div class="faint" style="font-size:12px;margin-top:8px">${ov ? 'Vlak / bus: cena vybraného spoje RegioJetu, nebo odhad – jízdenky kup u dopravce.' : c.bags ? 'Zavazadla jsou odhad podle dopravce.' : t.bags && t.bags !== 'none' ? 'Zavazadlo je podle ceníku dopravce v ceně letenky.' : 'Letenky bez zavazadel.'} Ceny u partnerů ověř před zaplacením.</div>
      </div>
      <div class="card step-card"><h3>✅ Co zarezervovat (v tomhle pořadí)</h3>
        ${steps.map((s, i) => `<label class="check"><input type="checkbox" data-bk="${esc(s.id)}" ${t.booked[s.id] ? 'checked' : ''}><span>${i + 1}. ${esc(s.label)}</span>${s.url ? `${affUrl(s.url) ? '<span class="ad-tag" style="margin-left:auto">reklama</span>' : ''}<a class="btn sm" href="${esc(safeUrl(s.url))}" target="_blank" rel="${affUrl(s.url) ? 'sponsored nofollow noopener' : 'noopener'}"${affUrl(s.url) ? '' : ' style="margin-left:auto"'}>Otevřít ↗</a>` : ''}</label>`).join('')}
        ${steps.some(s => affUrl(s.url)) ? SPONSOR_NOTE : ''}
        ${fly ? '<div class="note warn" style="margin-top:10px">⚠️ <div>Každý let je samostatná letenka – při zpoždění jednoho letu další aerolinka nečeká.</div></div>'
          : !ov && f.back && f.back.provider !== f.out.provider ? '<div class="note warn" style="margin-top:10px">⚠️ <div>Lety tam a zpět jsou dvě samostatné letenky – při zpoždění prvního letu druhá aerolinka nečeká.</div></div>' : ''}
      </div></div>
      <div class="row wrap sum-acts" style="gap:8px;margin:0 0 14px">
        <button class="btn primary" id="sumSave">💾 Uložit do plánovače</button>
        <button class="btn" id="sumShare">🔗 Zkopírovat odkaz na cestu</button>
        <button class="btn" id="sumIcs">📅 Do kalendáře</button>
        <a class="btn ghost" href="${esc(safeUrl(Ics.gcalUrl(tripEvent(t))))}" target="_blank" rel="noopener">Přidat do Google Kalendáře ↗</a>
        <button class="btn ghost" id="sumNew">Začít novou cestu</button>
      </div>
      ${multi && r.transport !== 'transit' && !ov && (!t.car || t.car.mode === 'skip') ? '<div class="note warn" style="margin-bottom:14px">🚗 <div>Přejezdy mezi místy trasy počítám <b>autem</b>, ale auto nemáš vybrané – vyber ho v kroku <b>Auto</b>, nebo tam zvol <b>Bez auta – mezi místy vlakem a busem</b>.</div></div>' : ''}
      ${multi && nightsLeft(t) !== 0 ? '<div class="note warn" style="margin-bottom:14px">⚠️ <div>Noci v trase nesedí s délkou pobytu – uprav je v kroku <b>Trasa</b>, jinak termíny ubytování nebudou navazovat na lety.</div></div>' : ''}
      ${window.Entry && Entry.ready() ? Entry.checklistHtml(isos, { ret: returnDate(t), pax: t.adults, via }) : '<div id="tripEntry"></div>'}
      ${window.PreTrip ? PreTrip.html(t, { isos, via, ret: returnDate(t) }) : ''}
      <div class="card step-card"><h3>🗓️ Průběh cesty</h3><div class="timeline">${tlRows(tl.slice(0, TL_TOP))}</div>${tl.length > TL_TOP ? `<details class="tl-more"><summary>Zobrazit celý průběh (ještě ${tl.length - TL_TOP} ${tl.length - TL_TOP < 5 ? 'řádky' : 'řádků'})</summary><div class="timeline">${tlRows(tl.slice(TL_TOP))}</div></details>` : ''}</div>
`;
    // odškrtnutá (i zase zrušená) letenka: „↻ Ověř cenu“ u ceny letenek zmizí (vrátí se) hned
    $$('[data-bk]', host).forEach(cb => cb.onchange = () => { t.booked[cb.dataset.bk] = cb.checked; persist(); if (/^flight\d+$/.test(cb.dataset.bk)) ageRefresh(); });
    wireAge();
    $('#sumSave').onclick = () => saveToPlanner();
    $('#sumShare').onclick = () => share();
    // odkaz se zkomprimuje hned, aby ho kliknutí jen zkopírovalo (Safari dovolí zápis do schránky jen v obsluze kliknutí)
    if (window.ShareLink) ShareLink.prepare('trip', linkJson(t));
    $('#sumIcs').onclick = () => icsDownload(`atlas-${t.dest.label}-${checkin}`, calendarEvents(t), { name: `Cesta: ${t.dest.label}` });
    $('#sumNew').onclick = () => restart();
    // vstupní podmínky dorazily až po vykreslení → shrnutí znovu (jen když je pořád otevřené)
    if (window.Entry && !Entry.ready()) Entry.whenReady(() => { if ($('#tripEntry') && T() && T().step === 'summary') summaryStep(); });
  }

  // Průběh cesty ve shrnutí: prvních TL_TOP řádků, zbytek pod „Zobrazit celý průběh“ (na telefonu by byl na 2 obrazovky)
  const TL_TOP = 8;
  const tlRows = rows => rows.map(x => `<div class="tl-row"><span class="tl-d">${dayLbl(x[0])}</span><span class="tl-i">${x[1]}</span><span>${x[2]}</span></div>`).join('');

  /* ---------- kalendář ---------- */
  /** Let ve tvaru pro kalendář a plánovač: místní časy + zóny letišť (bez času odletu dep = null). */
  const legBrief = l => ({
    from: l.from, to: l.to, date: l.date, dep: l.hasTime ? l.dep.slice(0, 16) : null, arr: l.hasTime && l.arr ? l.arr.slice(0, 16) : null,
    arrEst: !!l.arrEst, ...(l.arrUnknown && !l.arr ? { arrUnknown: true } : {}), fromTz: l.fromTz || null, toTz: l.toTz || null, carrier: l.carrierName || l.carrier || '', flightNo: l.flightNo || '', durationMin: l.durationMin || null,
  });

  /** Úsek vlakem/busem pro kalendář a plánovač: místní časy a zóny měst (bez spoje jen den). */
  const groundBrief = (g, a, b) => ({
    from: a.label, to: b.label, date: g.date, dep: g.dep || null, arr: g.arr || null, fromTz: a.tz || null, toTz: b.tz || null,
    kind: gKind(g), carrier: g.source === 'regiojet' ? gWho(g) : '', min: g.min || null, fromStation: g.fromStation || '', toStation: g.toStation || '',
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
    // cesta přes víc měst: lety mezi místy (každý samostatná letenka)
    const fly = isFly(t), mid = midLegs(t);
    if (fly) mid.forEach((l, i) => ev.push(Ics.flightEvent(legBrief(l), { url: l.bookUrl || undefined, note: `${i + 2}. let z ${mid.length + 2} · ${t.route.bases[i].name} → ${t.route.bases[i + 1].name} · samostatná letenka` })));
    // Ryanair / Wizz Air: připomínka online check-inu (24 h před odletem, na letišti se platí)
    if (!ov) for (const l of allLegs(t)) { const e = Ics.checkinEvent({ ...legBrief(l), carrier: l.carrier || l.carrierName }); if (e) ev.push(e); }
    // kdy nejpozději vyrazit na letiště (odhad): z domu a z ubytování
    const { home, hotel, mids } = leaveBy(t);
    if (home) {
      ev.push({ title: `🚪 Vyraž z domu na letiště ${home.airport}`, start: `${home.date}T${home.hm}`, tz: f.out.fromTz || null, durationMin: home.min, location: `Letiště ${home.airport}`,
        description: `Odhad: ~${minutesToHm(home.min)} cesta na letiště${home.taxi ? ' taxi (v noci MHD nejede – objednej předem)' : ''} + ${lbBefore(home)} před odletem.${t.groundMode === 'car' || home.taxi ? '' : ' Spoj ověř (IDOS).'}` });
    }
    if (hotel) {
      ev.push({ title: `🚪 Vyraž na letiště ${hotel.airport}`, start: `${hotel.date}T${hotel.hm}`, tz: f.back.fromTz || null, durationMin: hotel.min, location: `Letiště ${hotel.airport}`,
        description: [`Odhad: ~${minutesToHm(hotel.min)} cesta ${hotel.noStay ? 'z města' : 'z ubytování'} na letiště + ${lbBefore(hotel)} před odletem.`, hotel.hint ? `${hotel.hint[0].toUpperCase()}${hotel.hint.slice(1)}.` : ''].filter(Boolean).join('\n') });
    }
    (mids || []).forEach((x, i) => x && ev.push({ title: `🚪 Vyraž na letiště ${x.airport}`, start: `${x.date}T${x.hm}`, tz: midLegs(t)[i].fromTz || null, durationMin: x.min, location: `Letiště ${x.airport}`,
      description: [`Odhad: ~${minutesToHm(x.min)} cesta z ubytování na letiště + ${lbBefore(x)} před odletem.`, x.hint ? `${x.hint[0].toUpperCase()}${x.hint.slice(1)}.` : ''].filter(Boolean).join('\n') }));
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
        if (!next || fly) return;
        const x = r.transfers && r.transfers[i];
        ev.push({
          title: `${trIcon(tr, x)} Přejezd ${b.name} → ${next.name}`, start: `${d.checkout}T${CHECKOUT_HM}`, tz: (ov ? ov.to.tz : f.out.toTz) || null, durationMin: legMin(x, tr) || 120,
          location: next.name, url: legUrl(x, tr) || undefined,
          description: [x ? `${legTxt(x, tr)} (${estTxt(x, tr)})` : '', x && x.border ? `🛂 Přechod hranice ${ccName(x.border.from)} → ${ccName(x.border.to)} – počítej s kontrolou a vstupními podmínkami` : '',
            `Check-out ${b.name}, check-in ${next.name}`].filter(Boolean).join('\n'),
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
      const tz = { ...Object.fromEntries(mid.map(l => [l.from, l.fromTz])), [f.out.to]: f.out.toTz, ...(f.back ? { [f.back.from]: f.back.fromTz } : {}) };
      const note = `Auto na místě${t.car.totalCzk ? ` · ${czk(t.car.totalCzk)}` : ''}`;
      ev.push({ title: `🚗 Vyzvednutí auta (${t.car.pickup})`, start: t.car.from, tz: tz[t.car.pickup], durationMin: 30, location: `Letiště ${t.car.pickup}`, description: note });
      ev.push({ title: `🚗 Vrácení auta (${t.car.dropoff})`, start: t.car.to, tz: tz[t.car.dropoff], durationMin: 30, location: `Letiště ${t.car.dropoff}`, description: note });
    }
    // „🛂 Vyřídit ESTA (USA)“ ~14 dní před odletem (déle, když data uvádějí delší vyřízení), i za přestup v USA
    if (window.Entry) ev.push(...Entry.reminders(tripCountries(t), outLeg(t).date, fmtYMD(new Date()), tripVia(t)));
    // „🛡️ Sjednat cestovní pojištění“, „🚘 Vyřídit MŘP“ (jen když je nutný), „📝 Registrace v DROZD“ (pretrip.js)
    if (window.PreTrip) ev.push(...PreTrip.reminders(t, { isos: tripCountries(t), via: tripVia(t), ret: returnDate(t), today: fmtYMD(new Date()) }));
    const progDays = multi ? t.route.bases.map((b, i) => [b.name, basePlan(t, i)?.days || []]) : [[dest, tripPlan(t)?.days || []]];
    for (const [place, days] of progDays) {
      days.forEach((d, i) => {
        if (d.items && d.items.length) ev.push({ title: `Den ${i + 1} – ${place}`, start: d.date, location: place, description: d.items.map(x => `• ${x.name}${x.note ? ` – ${x.note}` : ''}`).join('\n') });
      });
    }
    return ev;
  }

  /** Název cesty: cíl, u cesty přes víc měst letadlem všechna města („Řím → Barcelona“). */
  const tripName = t => (isFly(t) ? t.route.bases.map(b => b.name).join(' → ') : t.dest.label);
  /** Celá cesta jako jedna celodenní událost (odkaz do Google Kalendáře). */
  function tripEvent(t) {
    const f = t.flight, { checkout } = stayDates(t), ov = ovOn(t) ? t.overland : null;
    const fl = l => `✈️ ${[l.from, l.hasTime && hhmm(l.dep), '→', l.to, arrHm(l)].filter(Boolean).join(' ')} (${fmtDate(l.date)}${l.carrierName ? ', ' + l.carrierName : ''})`;
    const gl = (g, a, b) => `${gIco(g)} ${a} → ${b} ${gTime(g)} (${fmtDate(g.date)}, ${gWho(g)})`;
    const b = backLeg(t);
    return {
      title: `🧳 Cesta: ${tripName(t)}`, start: outLeg(t).date, end: b ? b.date : checkout, location: t.dest.label,
      description: [ov ? gl(ov.out, ov.from.label, ov.to.label) : fl(f.out), ...(ov ? [] : midLegs(t).map(fl)), ov ? (ov.back ? gl(ov.back, ov.to.label, ov.from.label) : '') : f.back ? fl(f.back) : '',
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
    for (const [place, plan] of multi ? t.route.bases.map((b, i) => [b.name, basePlan(t, i)]) : [[null, tripPlan(t)]]) {
      for (const d of (plan?.days || [])) days[d.date] = [...(days[d.date] || []), ...d.items.map(x => actTxt(place, x))];
    }
    const dates = multi ? baseDates(t) : [];
    const ov = ovOn(t) ? t.overland : null;
    const gTxt = (g, a, b) => `${a}→${b} ${fmtDate(g.date)}${g.dep ? ' ' + hhmm(g.dep) : ''} (${g.source === 'regiojet' ? gWho(g) + ', ' : ''}${gKind(g)}${g.source === 'regiojet' ? '' : ', odhad'})`;
    const fTxt = l => `${l.from}→${l.to} ${fmtDate(l.date)}${depHm(l) ? ' ' + depHm(l) : ''} (${l.carrierName || l.provider})`;
    const flightTxt = ov ? `🚆 ${gTxt(ov.out, ov.from.label, ov.to.label)}${ov.back ? `, zpět ${gTxt(ov.back, ov.to.label, ov.from.label)}` : ''}`
      : isFly(t) ? `${allLegs(t).map((l, i) => `${i + 1}. ${fTxt(l)}`).join(', ')} · samostatné letenky`
      : `${f.out.from}→${f.out.to} ${fmtDate(f.out.date)}${depHm(f.out) ? ' ' + depHm(f.out) : ''} (${f.out.carrierName || f.out.provider})${f.back ? `, zpět ${f.back.from}→${f.back.to} ${fmtDate(f.back.date)}${depHm(f.back) ? ' ' + depHm(f.back) : ''} (${f.back.carrierName || f.back.provider})` : ''}`;
    // přejezdy se stejnými čísly jako v kroku Trasa (i cesta z/na letiště, u vlaku/busu z města příjezdu)
    const bs = multi ? t.route.bases : [], tr = multi ? t.route.transport : 'car', legs = (multi && t.route.legs) || {}, ovl = multi && ov ? overlandLegs(t) : null;
    const move = (x, a, b) => (x && x.km >= 1 ? `Přejezd ${a} → ${b}: ${legTxt(x, tr)} (${estTxt(x, tr)})${borderTxt(x)}` : '');
    const moves = multi ? [
      ovl ? move(ovl.arrival, ov.to.label, bs[0].name) : move(legs.arrival, `letiště ${f.out.to}`, bs[0].name),
      ...bs.slice(1).map((b, i) => move(t.route.transfers && t.route.transfers[i], bs[i].name, b.name)),
      ovl ? move(ovl.departure, bs[bs.length - 1].name, ov.to.label) : f.back ? move(legs.departure, bs[bs.length - 1].name, `letiště ${f.back.from}`) : '',
    ].filter(Boolean) : [];
    const notes = [
      ...(multi ? [`Trasa: ${t.route.bases.map(b => `${b.name} (${nightsTxt(b.nights)})`).join(' → ')}`, ...moves,
        ...t.route.bases.map((b, i) => `Ubytování ${b.name} ${fmtDate(dates[i].checkin)}–${fmtDate(dates[i].checkout)}: ${hotelName(b.stay) || 'zatím nevybráno'}${stayCzk(b.stay) ? ' – ' + czk(stayCzk(b.stay)) : ''}${b.stay && b.stay.mode === 'pick' && b.stay.url ? ' ' + b.stay.url : ''}`)]
        : [t.stay && t.stay.mode !== 'skip' ? `Ubytování: ${t.stay.name || ''} ${t.stay.totalCzk ? '– ' + czk(t.stay.totalCzk) : ''}${t.stay.url ? ' ' + t.stay.url : ''}` : '']),
      t.car && t.car.mode !== 'skip' ? `Auto: ${t.car.pickup || ''} ${t.car.from || ''} → ${t.car.dropoff || ''} ${t.car.to || ''} – ${czk(t.car.totalCzk)}` : '',
    ].filter(Boolean).join('\n');
    const entry = {
      name: `${tripName(t)} ${fmtDate(checkin)}`, dest: tripName(t), iso: byIso[t.dest.cc] ? t.dest.cc : null,
      // víc zemí, nebo území mimo seznam zemí (Portoriko → pravidla USA): kódy zemí pro vstupní podmínky
      ...(tripCountries(t).length > 1 || (tripCountries(t).length && !byIso[t.dest.cc]) ? { isos: tripCountries(t) } : {}),
      ...(tripVia(t).length ? { via: tripVia(t) } : {}),
      start: outLeg(t).date, end: backLeg(t) ? backLeg(t).date : checkout, pax: String(t.adults), budget: String(c.total), flight: flightTxt,
      ...(ov ? { ground: groundBriefs(ov) } : { legs: allLegs(t).map(legBrief) }), days,
      // „Sbaleno“: seznam z „Před cestou“ (úkoly a věci na míru, i s odškrtnutím), bez dat obecný PACK
      checklist: (window.PreTrip && PreTrip.plannerChecklist(t, { isos: tripCountries(t), via: tripVia(t), ret: returnDate(t) })) || PACK.map(x => ({ t: x, done: false })), notes,
      // celá cesta z průvodce (hotely, trasa, program, odškrtnuté rezervace) – „Otevřít v průvodci“ ji vrátí
      tripId: t.created || Date.now(), wizard: wizardJson(t),
    };
    // co vygeneroval průvodce – při opětovném uložení se pozná, co uživatel v plánovači přidal nebo změnil
    Object.assign(entry, { genName: entry.name, genNotes: notes, genBudget: entry.budget, genDays: JSON.parse(JSON.stringify(entry.days)), genChecklist: entry.checklist.map(x => x.t) });
    // Znovu uložená cesta (stejné tripId) se aktualizuje – bez kopie; vlastní název, ručně upravené poznámky
    // a odškrtnutí v plánovači zůstanou.
    const i = S.trips.findIndex(x => x && x.tripId && x.tripId === entry.tripId);
    if (i >= 0) {
      const old = S.trips[i], done = new Set((old.checklist || []).filter(x => x.done).map(x => x.t));
      const was = (v, gen) => gen != null && v !== gen; // změněno v plánovači
      // vlastní aktivity dne a vlastní položky „Sbaleno“ (ne ty, co dřív vygeneroval průvodce)
      const days = { ...entry.days };
      for (const [d, items] of Object.entries(old.days || {})) {
        const gen = new Set(((old.genDays || {})[d]) || []), mine = (items || []).filter(x => !gen.has(x) && !(days[d] || []).includes(x));
        if (mine.length) days[d] = [...(days[d] || []), ...mine];
      }
      const genCk = new Set(old.genChecklist || []), have = new Set(entry.checklist.map(x => x.t));
      const ownCk = (old.checklist || []).filter(x => old.genChecklist && !genCk.has(x.t) && !have.has(x.t));
      S.trips[i] = {
        // bez let/vlak/země z minulého uložení – průvodce je přidá, jen když platí
        ...old, legs: undefined, ground: undefined, isos: undefined, via: undefined, ...entry,
        name: was(old.name, old.genName) ? old.name : entry.name,
        notes: was(old.notes, old.genNotes) ? old.notes : entry.notes,
        budget: was(old.budget, old.genBudget) ? old.budget : entry.budget,
        checklist: [...entry.checklist.map(x => ({ ...x, done: x.done || done.has(x.t) })), ...ownCk],
        days,
      };
    } else S.trips.push(entry);
    persist();
    toast(i >= 0 ? 'Cesta v plánovači aktualizována' : 'Cesta uložena do plánovače');
    go('planner');
  }
  /** Cesta z průvodce k uložení v plánovači: jako sdílený odkaz, ale s odškrtnutými rezervacemi. */
  function wizardJson(t) {
    try { return { ...JSON.parse(shareJson(t)), booked: { ...(t.booked || {}) } }; } catch (e) { return null; }
  }
  /**
   * Uloženou cestu z plánovače zpět do průvodce (id = tripId – odškrtnutí „Před cestou“ jsou pod ním). Rozpracovanou
   * jinou cestu nahradí až po otázce; stejná cesta, která v průvodci je, se jen otevře (může být novější).
   */
  function openSaved(w, id) {
    let t = null;
    try { t = w && w.flight && w.flight.out ? sanitizeTrip(JSON.parse(JSON.stringify(w))) : null; } catch (e) { t = null; }
    if (!t) { toast('Cestu se nepodařilo otevřít', 'err'); return false; }
    const mine = S.trip;
    if (mine && mine.created === id) { go('trip'); return true; }
    if (mine && mine.flight && progressOf(mine).length
      && !confirm(`V průvodci máš rozpracovanou cestu: ${mine.dest?.label || mine.flight.out.to} (${progressOf(mine).join(', ')}). Nahradit ji uloženou cestou ${t.dest.label || t.flight.out.to}?`)) return false;
    const booked = {};
    for (const [k, v] of Object.entries(w.booked || {})) if (v === true && /^[\w:.,-]{1,140}$/.test(k)) booked[k] = true; // i id míst „geo:48.85,2.35“
    S.trip = { ...t, booked, step: 'summary', created: id };
    staysData = null; carsData = null;
    persist();
    go('trip');
    return true;
  }

  /** JSON cesty do sdíleného odkazu (#trip=…, zkomprimovaný – sharelink.js): bez odškrtnutých rezervací a času založení. */
  function shareJson(t) {
    const slim = { ...t, booked: {}, created: undefined, statsWait: undefined, statsPreview: undefined, statsPart: t.statsPart ? true : undefined };
    // „Co zařídit a co sbalit“: aktivity, vlastní položky i odškrtnutí (ta jsou jinak jen v localStorage tohoto prohlížeče)
    if (window.PreTrip) slim.pretrip = PreTrip.shareState(t);
    if (t.route) {
      // Program míst jen s tím, co vykreslí plánovač a shrnutí (bez popisů, fotek a „dalších míst“) – kratší odkaz.
      const item = x => ({ id: x.id, name: x.name, lat: x.lat, lon: x.lon, category: x.category, tripKind: x.tripKind, visitMin: x.visitMin, fromPrevKm: x.fromPrevKm, fromPrevMin: x.fromPrevMin, transit: x.transit, note: x.note, cc: x.cc, includes: x.includes });
      const plan = p => (p ? { ...p, spare: undefined, days: (p.days || []).map(d => ({ ...d, items: (d.items || []).map(item) })) } : null);
      slim.route = { ...t.route, candidates: undefined, bases: (t.route.bases || []).map((b, i) => ({ ...b, plan: plan(isMulti(t) ? basePlan(t, i) : b.plan) })) };
    }
    return JSON.stringify(slim);
  }
  /**
   * Odkaz na cestu (#trip=): shareJson bez toho, co příjemce nevykreslí – program bez popisů, fotek a „dalších míst“
   * (i u cesty do jednoho místa), souřadnice na 5 desetinných míst (~1 m; program se znovu použije do 1e-4°), u letu
   * jen to, co čte průvodce. Seznam vynechaných polí (ne povolených), ať pole nových funkcí cestují dál. Formát stejný
   * – odkaz otevře i starší verze aplikace. Kopie v plánovači (wizardJson) zůstávají celé.
   */
  function linkJson(t) {
    const o = JSON.parse(shareJson(t));
    const r5 = v => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1e5) / 1e5 : v);
    const geo = x => (x && x.lat != null ? { ...x, lat: r5(x.lat), lon: r5(x.lon) } : x);
    // cc = země zastávky výletu (odkazy na mapy), includes = „Zahrnuje: …“ u celku s částmi
    const item = x => ({ id: x.id, name: x.name, lat: r5(x.lat), lon: r5(x.lon), category: x.category, tripKind: x.tripKind, visitMin: x.visitMin, fromPrevKm: x.fromPrevKm, fromPrevMin: x.fromPrevMin, ...(x.transit ? { transit: true } : {}), note: x.note,
      ...(x.cc ? { cc: x.cc } : {}), ...(Array.isArray(x.includes) && x.includes.length ? { includes: x.includes } : {}) });
    const plan = p => (p && Array.isArray(p.days) ? { ...p, spare: undefined, created: undefined, center: geo(p.center), days: p.days.map(d => ({ ...d, items: (d.items || []).map(item) })) } : p);
    delete o.step; delete o.booked; delete o.created; // příjemce je nastaví sám (importFromHash)
    if (o.flight) {
      const f = { ...o.flight };
      for (const k of ['id', 'perPersonCzk', 'tripCzk', 'totalCzk', 'tempHi', 'nights']) delete f[k];
      if (f.deal) f.deal = { level: f.deal.level }; // „🔥 Super cena“ v kroku letu
      const leg = l => { if (!l) return l; const x = { ...l }; for (const k of ['foundAt', 'prevCzk', 'otherDeps', 'price', 'currency', 'czk']) delete x[k]; if (x.arrEst === false) delete x.arrEst; return x; }; // live zůstane – „Je to dobrá cena?“ podle něj pozná živou cenu
      o.flight = { ...f, out: leg(f.out), back: leg(f.back), ...(Array.isArray(f.mid) ? { mid: f.mid.map(leg) } : {}) };
    }
    if (o.ground) o.ground = Object.fromEntries(['out', 'back'].filter(k => o.ground[k]).map(k => [k, { minutes: o.ground[k].minutes, ...(o.ground[k].own === true ? { own: true } : {}) }])); // jen groundLines
    const arr = a => {
      if (!a) return a;
      const x = { ...a }; for (const k of ['note', 'src', 'date', 'sec', 'gen', 'km']) delete x[k];
      if (x.taxi) x.taxi = { fare: x.taxi.fare, cur: x.taxi.cur, czk: x.taxi.czk, ...(x.taxi.hi ? { hi: x.taxi.hi } : {}), ...(x.taxi.night ? { night: x.taxi.night } : {}), ...(x.taxi.pax ? { pax: x.taxi.pax } : {}) }; // pevná cena taxi bez zdroje
      return x;
    };
    if (o.arrival) o.arrival = { out: arr(o.arrival.out), back: arr(o.arrival.back), ...(Array.isArray(o.arrival.mid) ? { mid: o.arrival.mid.map(x => ({ from: arr(x && x.from), to: arr(x && x.to) })) } : {}) };
    o.stay = geo(o.stay); o.cityCenter = geo(o.cityCenter);
    o.plan = plan(o.plan);
    // trasa po přepnutí zpět na jedno místo (Víc míst → Jedno místo): příjemce ji neukáže
    if (o.route && o.route.mode !== 'multi') delete o.route;
    // souřadnice míst trasy a cesty po zemi se nezaokrouhlují – groundKey je porovnává přes toFixed(3)
    if (o.route && Array.isArray(o.route.bases)) {
      o.route = { ...o.route, bases: o.route.bases.map(b => {
        const nb = { ...b, stay: geo(b.stay), plan: plan(b.plan) };
        if (b.stay && b.stay.mode === 'pick' && b.stay.url) delete nb.searchUrl; // hledání ubytování jen bez vybraného hotelu
        return nb;
      }) };
    }
    return JSON.stringify(o);
  }

  /** Zkopíruje odkaz na cestu (připravený už při vykreslení shrnutí); vrací Promise kvůli testům. */
  function share() {
    return ShareLink.copy('trip', linkJson(T())).then(r => (r.copied ? toast('Odkaz zkopírován – pošli ho komukoliv') : prompt('Zkopíruj odkaz:', r.url)));
  }

  /**
   * Data ze sdíleného odkazu jsou cizí vstup: z textů odstraň znaky, které by šly použít k vložení
   * HTML (<, >, uvozovky, `), čísla převeď na čísla a odkazy pustí dál jen safeUrl při vykreslení.
   */
  function sanitizeTrip(raw, o = {}) {
    // Odkazy (…url/Url) mohou být dlouhé (Ryanair ~400 znaků) – nezkracovat; texty do 300 znaků. o.quotes: apostrofy
    // a uvozovky nechat (Castel Sant'Angelo) – jen pro výstup, který všechno escapuje (karta „📍 Dnes na cestě“).
    const bad = o.quotes ? /[<>`]/g : /[<>"'`]/g;
    const clean = (v, key = '') => typeof v === 'string' ? v.replace(bad, '').slice(0, /url$/i.test(key) ? 4000 : 300)
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
    // cesta přes víc měst: lety mezi místy (jen s letem zpět; bez nich trasa podle letů neplatí – viz isFly)
    const mid = Array.isArray(t.flight.mid) ? t.flight.mid.filter(isLeg).slice(0, MAX_BASES - 1).map(leg) : [];
    if (mid.length) t.flight.mid = mid; else delete t.flight.mid;
    t.flight.flightCzk = num(t.flight.flightCzk, 0, 1e7, 0);
    t.flight.groundCzk = num(t.flight.groundCzk, 0, 1e6, 0);
    t.flight.bagCzk = num(t.flight.bagCzk, 0, 1e6, 0);
    t.flight.arrCzk = num(t.flight.arrCzk, 0, 1e6, 0);
    // čas ceny letu („cena z …“): jen rozumný a ne z budoucnosti (hodiny jiného zařízení), jinak pryč jako u starších cest
    if (!okFin(t.flight.pricedAt, 1.5e12, Date.now() + 864e5)) delete t.flight.pricedAt;
    t.arrival = cleanArrival(t.arrival);
    for (const k of ['stay', 'car']) if (t[k] && typeof t[k] === 'object') t[k].totalCzk = num(t[k].totalCzk, 0, 1e7, 0);
    if (t.stay && typeof t.stay === 'object' && 'est' in t.stay) { if (t.stay.est === true) t.stay.est = true; else delete t.stay.est; }
    if (!t.dest || typeof t.dest !== 'object') t.dest = { label: t.flight.out.to };
    if (!t.ground || typeof t.ground !== 'object') t.ground = {};
    t.groundMode = t.groundMode === 'car' ? 'car' : 'transit'; // starší odkazy pole nemají = veřejnou dopravou
    t.carFuel = t.groundMode === 'car' && carFuelOk(t.carFuel) ? t.carFuel : null; // pohon auta (starší odkazy: palivo)
    if (t.plan && !Array.isArray(t.plan.days)) t.plan = null;
    t.route = cleanRoute(t.route);
    t.overland = cleanOverland(t.overland);
    t.groundRef = cleanGroundRef(t.groundRef);
    // „Je to dobrá cena?“: statistika jen s čísly a daty; úroveň ceny jen známá (štítek ji hledá v tabulce), jinak se dopočítá
    t.priceStats = cleanPriceStats(t.priceStats);
    // Cesta z odkazu, zálohy či uložená na konečný výsledek hledání v tomto prohlížeči nečeká: let z průběžných výsledků
    // má statistiku z nich a poznámku (statsPart – jen příznak, dotaz hledání se dál nepáruje).
    t.statsPreview = cleanPriceStats(t.statsPreview);
    giveUpStats(t);
    if (t.statsPart) t.statsPart = true; else delete t.statsPart;
    const pl = t.flight.priceLevel;
    if (pl != null && !(okObj(pl) && ['low', 'normal', 'high'].includes(pl.level) && typeof pl.reason === 'string' && okFin(pl.ref, 0, 1e7) && okFin(pl.vsRef, -100, 1e5) && (pl.pos == null || okFin(pl.pos, 0, 100)))) delete t.flight.priceLevel;
    t.ccs = Array.isArray(t.ccs) ? [...new Set(t.ccs.filter(x => typeof x === 'string' && /^[A-Z]{2}$/.test(x)))].slice(0, 8) : undefined;
    // „Co zařídit a co sbalit“: jen známé aktivity, pročištěné vlastní položky a id odškrtnutí ve známém tvaru (pretrip.js)
    const pt = window.PreTrip ? PreTrip.sanitize(t.pretrip) : undefined;
    if (pt) t.pretrip = pt; else delete t.pretrip;
    return t;
  }

  // Cesta z letiště do města ze sdíleného odkazu (už prošel clean()): jen známá pole, čísla v mezích, zdroj jen https.
  function cleanArrivalLeg(a) {
    if (!okObj(a) || !/^[A-Z0-9]{3}$/.test(a.iata || '') || !okFin(a.czk, 0, 1e5) || !okFin(a.min, 1, 600)) return null;
    return {
      iata: a.iata, city: okStr(a.city, 60) || a.iata, gen: okStr(a.gen, 60) || null, mode: ['bus', 'train', 'metro', 'tram', 'taxi'].includes(a.mode) ? a.mode : 'bus',
      how: okStr(a.how, 160), czk: Math.round(a.czk), min: Math.round(a.min), basis: ['table', 'access', 'estimate'].includes(a.basis) ? a.basis : 'estimate',
      ...(okFin(a.lat, -90, 90) && okFin(a.lon, -180, 180) ? { lat: a.lat, lon: a.lon } : {}),
      ...(okFin(a.fare, 0, 1e6) && /^[A-Z]{3}$/.test(a.cur || '') ? { fare: a.fare, cur: a.cur, ...(okFin(a.typ, 0, 1e6) ? { typ: a.typ } : {}) } : {}),
      ...(a.from === true ? { from: true } : {}), ...(a.sec === true ? { sec: true } : {}), ...(okFin(a.km, 0, 1000) ? { km: Math.round(a.km) } : {}),
      ...(okStr(a.note, 140) ? { note: okStr(a.note, 140) } : {}), ...(okYmd(a.date) ? { date: a.date } : {}),
      ...(typeof a.src === 'string' && /^https:\/\/[^\s]{4,300}$/i.test(a.src) ? { src: a.src } : {}),
      ...(cleanTaxi(a.taxi) ? { taxi: cleanTaxi(a.taxi) } : {}),
    };
  }
  /** Pevná cena taxi za auto (nightTaxis): čísla v mezích, měna, Kč za auto v noci. */
  function cleanTaxi(x) {
    if (!okObj(x) || !okFin(x.fare, 0.01, 1e5) || !/^[A-Z]{3}$/.test(x.cur || '') || !okFin(x.czk, 1, 1e5)) return null;
    return {
      fare: x.fare, cur: x.cur, czk: Math.round(x.czk), ...(okFin(x.hi, 0.01, 1e5) ? { hi: x.hi } : {}), ...(okFin(x.night, 0.01, 1e5) ? { night: x.night } : {}),
      ...(okFin(x.pax, 1, 8) ? { pax: Math.round(x.pax) } : {}), ...(okStr(x.to, 140) ? { to: okStr(x.to, 140) } : {}), ...(okYmd(x.date) ? { date: x.date } : {}),
      ...(typeof x.src === 'string' && /^https:\/\/[^\s]{4,300}$/i.test(x.src) ? { src: x.src } : {}),
    };
  }
  const cleanArrival = v => (okObj(v) ? {
    out: cleanArrivalLeg(v.out), back: cleanArrivalLeg(v.back),
    ...(Array.isArray(v.mid) && v.mid.length ? { mid: v.mid.slice(0, MAX_BASES - 1).map(x => ({ from: cleanArrivalLeg(okObj(x) ? x.from : null), to: cleanArrivalLeg(okObj(x) ? x.to : null) })) } : {}),
  } : null);
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
      ...(g.demo === true && g.source === 'regiojet' && dep && arr ? { demo: true } : {}),
      // odhad: „od“ k běžné ceně (jen popisek)
      ...(!(g.source === 'regiojet' && dep && arr) && okFin(g.fromCzk, 1, 1e5) ? { fromCzk: Math.round(g.fromCzk) } : {}),
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
      est: okObj(o.est) && okFin(o.est.minutes, 1, 3000) && okFin(o.est.czk, 0, 1e5) ? { minutes: Math.round(o.est.minutes), czk: Math.round(o.est.czk), ...(okFin(o.est.typ, 1, 1e5) ? { typ: Math.round(o.est.typ) } : {}), basis: o.est.basis === 'measured' ? 'measured' : 'distance' } : null,
      links: { out: cleanLinks(okObj(o.links) ? o.links.out : null), back: cleanLinks(okObj(o.links) ? o.links.back : null) },
    };
  }
  function cleanPriceStats(s) {
    const nums = ['n', 'min', 'p25', 'median', 'p75', 'max'];
    if (!okObj(s) || !nums.every(k => okFin(s[k], 0, 1e7)) || !okYmd(s.dateFrom) || !okYmd(s.dateTo)) return null;
    return { ...Object.fromEntries(nums.map(k => [k, s[k]])), dateFrom: s.dateFrom, dateTo: s.dateTo };
  }
  function cleanGroundRef(g) {
    if (!okObj(g) || !okQ(g.q) || !okFin(g.min, 1, 3000) || !okFin(g.czk, 0, 1e5)) return null;
    return {
      q: okQ(g.q), km: okFin(g.km, 0, 5000) ? Math.round(g.km) : 0, min: Math.round(g.min), czk: Math.round(g.czk), ...(okFin(g.typ, 1, 1e5) ? { typ: Math.round(g.typ) } : {}), basis: g.basis === 'measured' ? 'measured' : 'distance',
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
    const cc2 = v => typeof v === 'string' && /^[A-Z]{2}$/.test(v);
    const leg = x => (obj(x) && fin(x.km, 0, 20000) && fin(x.carMin, 0, 10000) && fin(x.transitMin, 0, 10000) ? {
      km: Math.round(x.km), carMin: Math.round(x.carMin), transitMin: Math.round(x.transitMin), long: x.long === true, carUrl: url(x.carUrl), transitUrl: url(x.transitUrl),
      // bez druhu dopravy = přejezd ze starší verze → v kroku Trasa se přepočítá
      ...(x.transitKind === 'bus' || x.transitKind === 'rail' ? { transitKind: x.transitKind } : {}), basis: x.basis === 'route' ? 'route' : 'estimate',
      border: obj(x.border) && cc2(x.border.from) && cc2(x.border.to) ? { from: x.border.from, to: x.border.to } : null, ...(x.hsr === true ? { hsr: true } : {}), ...(x.fast === true ? { fast: true } : {}),
      // odhad ceny přejezdu (palivo za auto, jízdenka na osobu)
      ...(fin(x.fuelCzk, 0, 100000) ? { fuelCzk: Math.round(x.fuelCzk) } : {}), ...(fin(x.tollCzk, 0, 100000) ? { tollCzk: Math.round(x.tollCzk) } : {}), ...(fin(x.fareCzk, 0, 100000) ? { fareCzk: Math.round(x.fareCzk) } : {}),
    } : null);
    // přejezdy z města příjezdu vlakem/busem: klíč = poloha města a prvního/posledního místa
    const gl = r.groundLegs;
    const groundLegs = obj(gl) && typeof gl.key === 'string' && /^[-\d.,|]{1,80}$/.test(gl.key) ? { key: gl.key, arrival: leg(gl.arrival), departure: leg(gl.departure) } : null;
    const airport = x => (pos(x) && /^[A-Z0-9]{3}$/.test(x.iata || '') ? { iata: x.iata, name: str(x.name, 80), lat: x.lat, lon: x.lon } : null);
    const stay = x => (obj(x) && ['pick', 'manual', 'skip', 'links'].includes(x.mode) ? {
      mode: x.mode, id: str(x.id, 120), name: str(x.name, 120), totalCzk: fin(x.totalCzk, 0, 1e7) ? x.totalCzk : 0, url: url(x.url),
      lat: fin(x.lat, -90, 90) ? x.lat : null, lon: fin(x.lon, -180, 180) ? x.lon : null, rating: fin(x.rating, 0, 10) ? x.rating : null,
      provider: str(x.provider, 40), checkin: ymd(x.checkin), checkout: ymd(x.checkout), ...(x.est === true ? { est: true } : {}),
      ...(str(x.near, 80) ? { near: str(x.near, 80) } : {}), // hotel z okolí: jeho místo
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
        searchUrl: url(b.searchUrl), stay: stay(b.stay), plan: plan(b.plan), ...(Number.isInteger(b.gid) && b.gid > 0 && b.gid < 1e10 ? { gid: b.gid } : {}),
      };
    };
    const bases = (Array.isArray(r.bases) ? r.bases.slice(0, MAX_BASES) : []).map(base).filter(Boolean);
    const transport = r.transport === 'transit' ? 'transit' : 'car';
    if (bases.length < 2) return { mode: 'single', transport, bases: [], transfers: [], legs: {}, exclude: [], candidates: [], notes: [] };
    const transfers = Array.isArray(r.transfers) ? r.transfers.slice(0, bases.length - 1).map(leg) : [];
    // trasa podle letů: přejezdy z místa na letiště jiného města (klíč g<místo><letiště>, false = nepovedl se)
    const gaps = obj(r.gaps) ? Object.fromEntries(Object.entries(r.gaps).filter(([k]) => /^g\d[A-Z0-9]{3}$/.test(k)).slice(0, MAX_BASES)
      .map(([k, v]) => [k, v === false ? false : leg(v)]).filter(([, v]) => v !== null)) : {};
    return {
      mode: r.mode === 'multi' ? 'multi' : 'single', transport, bases, ...(r.fixed === 'flights' ? { fixed: 'flights', ...(Object.keys(gaps).length ? { gaps } : {}) } : {}),
      // chybějící nebo poškozené přejezdy se v kroku Trasa dopočítají
      transfers: transfers.length === bases.length - 1 && transfers.every(Boolean) ? transfers : [],
      legs: { arrival: leg(obj(r.legs) ? r.legs.arrival : null), departure: leg(obj(r.legs) ? r.legs.departure : null) }, groundLegs,
      arrival: airport(r.arrival), departure: airport(r.departure),
      want: [2, 3, 4].includes(r.want) ? r.want : null,
      exclude: Array.isArray(r.exclude) ? r.exclude.filter(x => typeof x === 'string' && x.length <= 100).slice(0, 30) : [],
      notes: Array.isArray(r.notes) ? r.notes.filter(x => typeof x === 'string').slice(0, 5).map(x => x.slice(0, 300)) : [],
      candidates: [], demo: r.demo === true,
    };
  }

  /** Načte sdílenou cestu z #trip=… (volá app.js při startu) → Promise<boolean>. */
  async function importFromHash() {
    const m = location.hash.match(/^#trip=([A-Za-z0-9_-]+)$/);
    if (!m) return false;
    try {
      const parsed = JSON.parse(await ShareLink.unpack(m[1]));
      if (!parsed || !parsed.flight || !parsed.flight.out) throw new Error('neplatná data');
      const t = sanitizeTrip(parsed);
      const mine = S.trip;
      // tatáž cesta (stejné spoje, lidé, ubytování, auto i trasa): vlastní odkaz, nebo novější verze od spolucestujícího
      const same = (() => { try { return Boolean(mine && mine.flight) && tripSig(mine) === tripSig(t); } catch (e) { return false; } })(); // poškozená rozpracovaná cesta = jiná
      // … i se stejným programem, dopravou trasy a „Co zařídit a co sbalit“ (odškrtnutí z odkazu už má) → v odkazu nic
      // nového, rozpracovaná cesta zůstane, jak je (s odškrtnutými rezervacemi i časem založení – plánovač ji pak aktualizuje, ne zdvojí)
      const known = same && (() => {
        try {
          const x = sanitizeTrip(JSON.parse(linkJson(mine))), have = (x.pretrip && x.pretrip.done) || [];
          return linkSig(x) === linkSig(t) && ((t.pretrip && t.pretrip.done) || []).every(id => have.includes(id));
        } catch (e) { return false; }
      })();
      if (known) {
        mine.step = 'summary'; persist();
        history.replaceState(null, '', '#trip');
        toast('Tuhle cestu už máš rozpracovanou – otevírám ji');
        return true;
      }
      // jinou cestu (i tutéž s jiným obsahem) nahradí bez ptaní, jen když v ní nic není rozpracované (jako výběr letu z výsledků)
      if (mine && mine.flight && progressOf(mine).length
        && !confirm(same ? `Odkaz je na tvoji rozpracovanou cestu (${mine.dest?.label || mine.flight.out.to}), ale v jiné podobě (např. s jiným programem). Nahradit ji verzí z odkazu? Odškrtnuté rezervace zůstanou.`
          : `Otevíráš sdílenou cestu (${t.dest.label || t.flight.out.to}). Nahradit jí tvoji rozpracovanou cestu (${mine.dest?.label || mine.flight.out.to})?`)) {
        history.replaceState(null, '', '#trip');
        return false;
      }
      // tatáž cesta: odškrtnuté rezervace i čas založení zůstanou (plánovač ji aktualizuje, odškrtnutí karty se přidají)
      S.trip = same ? { ...t, booked: mine.booked || {}, step: 'summary', created: Number.isFinite(mine.created) ? mine.created : Date.now() }
        : { ...t, booked: {}, step: 'summary', created: Date.now() };
      staysData = null; carsData = null; // nabídky ubytování a aut patřily předchozí cestě
      // odškrtnutí z odkazu k nové cestě do localStorage (odškrtnutí ostatních cest zůstanou)
      if (window.PreTrip) PreTrip.adopt(S.trip);
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

  // Aplikace zavřená nebo znovu načtená dřív, než hledání doběhlo: na jeho konečný výsledek už cesta nepočká.
  if (typeof S !== 'undefined' && S && S.trip && S.trip.statsWait) { giveUpStats(S.trip); persist(); }

  window.Trip = { start, flyOk, finalStats, statsGiveUp, openSaved, render: safeRender, ageRefresh, importFromHash, costs, sanitizeTrip, calendarEvents, leaveBy, baseDates, baseProgram, legBrief, stayDates, tripEvent, tripCountries, tripVia, groundLines, timeline, placeOn, legBack };
})();
