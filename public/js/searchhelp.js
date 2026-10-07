/* ATLAS – pomoc s výsledky hledání letů: čistá logika bez DOM, aby šla testovat v node (test/searchhelp.test.js).
   Lety po jednotlivých letech u přesných dat, „nejbližší dny“, výpadek Kiwi.com, aktivní filtry (i čas a přestupy)
   a návrhy, jak hledání jedním kliknutím rozšířit, když je výsledků málo. */
(function () {
  const pad = n => String(n).padStart(2, '0');
  const kc = n => Math.round(n).toLocaleString('cs-CZ') + ' Kč';
  const dm = d => `${+d.slice(8, 10)}. ${+d.slice(5, 7)}.`;
  const ms = d => Date.parse(d + 'T12:00:00Z');
  const addDays = (d, n) => new Date(ms(d) + n * 864e5).toISOString().slice(0, 10);
  const diffDays = (a, b) => Math.round((ms(b) - ms(a)) / 864e5);
  const hhmm = l => String(l.dep || '').slice(11, 16);
  const MONTHS = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];

  /** Totožný let (trasa, odlet, dopravce, přestupy) – stejný klíč jako na serveru (topWithDays). */
  const legSig = l => `${l.from}|${l.to}|${l.dep}|${l.carrier}|${l.stops}`;

  // Návrat nejdřív 2 h po příletu tam – stejné pravidlo jako server (optimizer.js returnFits).
  const localMs = s => Date.parse(String(s).slice(0, 16) + ':00Z');
  function returnFits(o, b) {
    if (!o.arr || !b.hasTime) return true;
    const gap = localMs(b.dep) - localMs(o.arr);
    return !Number.isFinite(gap) || gap >= 120 * 60000;
  }

  /**
   * Cesta ze dvou samostatných letenek: let tam z kombinace ot a let zpět z kombinace bt (přesná data, pohled „Lety“),
   * i když tahle dvojice mezi nejlepšími kombinacemi ze serveru není. Cena stejně jako na serveru: letenky + doprava
   * na domácí letiště + zavazadla (leg.groundCzk / leg.bagCzk). Společná zpáteční letenka, jiné město, návrat na jiné
   * letiště bez open-jaw nebo návrat dřív než 2 h po příletu → null. Autem (park(fromIata, nights) → parkování Kč/os.
   * na celou cestu jako na serveru): návrat jen na letiště, kde auto parkuje.
   */
  function composeTrip(ot, bt, { adults = 1, openJaw = true, park = null } = {}) {
    const o = ot && ot.out, b = bt && bt.back;
    if (!o || !b || ot.combined || bt.combined) return null;
    if (![o, b].every(l => l.czk > 0 && Number.isFinite(l.groundCzk) && Number.isFinite(l.bagCzk))) return null;
    if (b.from !== o.to && !(openJaw && ot.destKey && ot.destKey === bt.destKey)) return null;
    if (b.to !== o.from && (!openJaw || park)) return null;
    if (b.date < o.date || !returnFits(o, b)) return null;
    const pk = park ? park(o.from, diffDays(o.date, b.date)) || 0 : 0;
    const flightCzk = o.czk + b.czk, groundCzk = o.groundCzk + b.groundCzk + pk, bagCzk = o.bagCzk + b.bagCzk;
    const perPersonCzk = flightCzk + groundCzk + bagCzk;
    return {
      id: [o.provider, o.from, o.to, o.dep, b.provider, b.from, b.to, b.dep].join('|'),
      out: o, back: b, flightCzk, groundCzk, ...(pk ? { parkCzk: pk } : {}), bagCzk, bagEst: o.bagEst || b.bagEst || undefined,
      perPersonCzk, totalCzk: perPersonCzk * adults, nights: diffDays(o.date, b.date),
      provider: o.provider === b.provider ? o.provider : 'mix', combined: false, bookUrl: null,
      distanceKm: ot.distanceKm, tempHi: ot.tempHi, destKey: ot.destKey,
      deal: { level: 'normal', score: null, drop: null }, composed: true,
    };
  }

  /**
   * Odlišné lety jedním směrem (side = 'out' | 'back') z kombinací: ke každému nejlevnější kombinace s ním (best),
   * počet kombinací a – je-li vybraný let druhým směrem (pair = jeho legSig) – nejlevnější kombinace právě s ním (paired).
   * Když taková kombinace mezi výsledky není, ale oba lety jsou samostatné letenky, složí ji composeTrip
   * (opts: adults, openJaw, keep(trip) = projde filtry výpisu).
   */
  function distinctLegs(trips, side, pair = null, opts = {}) {
    const other = side === 'out' ? 'back' : 'out';
    const map = new Map();
    let sel = null; // nejlevnější kombinace (samostatné letenky) s vybraným letem druhým směrem
    for (const t of trips || []) {
      const l = t[side];
      if (!l) continue;
      const k = legSig(l);
      let x = map.get(k);
      if (!x) map.set(k, x = { sig: k, leg: l, best: t, paired: null, count: 0, sep: null });
      x.count++;
      if (t.perPersonCzk < x.best.perPersonCzk) x.best = t;
      if (!t.combined && (!x.sep || t.perPersonCzk < x.sep.perPersonCzk)) x.sep = t;
      if (pair && t[other] && legSig(t[other]) === pair) {
        if (!x.paired || t.perPersonCzk < x.paired.perPersonCzk) x.paired = t;
        if (!t.combined && (!sel || t.perPersonCzk < sel.perPersonCzk)) sel = t;
      }
    }
    const list = [...map.values()];
    if (sel) {
      for (const x of list) {
        if (x.paired || !x.sep) continue;
        const t = side === 'back' ? composeTrip(sel, x.sep, opts) : composeTrip(x.sep, sel, opts);
        if (t && (!opts.keep || opts.keep(t))) x.paired = t;
      }
    }
    return list;
  }

  /** Řazení letů: by = 'time' (odlet) nebo 'price' (cena kombinace; se spárovanými lety napřed). */
  function sortLegs(list, by = 'price', pair = null) {
    const price = x => (pair ? x.paired : x.best)?.perPersonCzk ?? Infinity;
    const dep = x => x.leg.dep || '';
    return list.slice().sort((a, b) => by === 'time'
      ? dep(a).localeCompare(dep(b)) || price(a) - price(b)
      : (pair ? Number(!a.paired) - Number(!b.paired) : 0) || price(a) - price(b) || dep(a).localeCompare(dep(b)));
  }

  /** Přímé lety, které už ve výsledcích jsou s cenou (trasa|den|dopravce|čas) – v „dalších letech“ je neopakovat. */
  function pricedTimes(trips) {
    const s = new Set();
    for (const t of trips || []) {
      for (const l of [t.out, t.back]) if (l && !l.stops && l.hasTime) s.add(`${l.from}|${l.to}|${l.date}|${l.carrier}|${hhmm(l)}`);
    }
    return s;
  }
  /** Další odlety téhož dne bez ceny (otherDeps), kromě těch, které výsledky ukazují i s cenou. */
  function freeDeps(l, priced) {
    return (l && l.otherDeps || []).filter(x => !(priced && priced.has(`${l.from}|${l.to}|${l.date}|${l.carrier}|${x}`)));
  }

  /**
   * Pruh „Nejbližší dny“ pro jeden směr (nearby.out / nearby.back): každý den from..to s nejlevnější známou
   * cenou (cost, nebo null), zadaný den (around), nejlevnější den (best) a dny, které vybrat nejde (před minDate).
   * Autem tam i zpět (server, carNear): u Tam parkování na celou cestu (parkCzk Kč/os. na parkDays dní), u Zpět jen
   * jeho změna proti řádku Tam (parkCzk ±, jinak null) a tripAdj = rozdíl, když by auto stálo u jiného letiště
   * (from u Tam, to u Zpět) – Tam + Zpět je pak cena celé cesty.
   */
  function nearStrip(side, { minDate = null } = {}) {
    if (!side || !side.from || !side.to) return [];
    const byDate = new Map((side.days || []).map(d => [d.date, d]));
    const costs = (side.days || []).map(d => d.cost);
    const min = costs.length ? Math.min(...costs) : null;
    const out = [];
    for (let d = side.from, i = 0; d <= side.to && i < 15; d = addDays(d, 1), i++) {
      const x = byDate.get(d);
      out.push({
        date: d, cost: x ? x.cost : null, carrierName: x ? x.carrierName : null, stops: x ? x.stops : null,
        from: x ? x.from : null, to: x ? x.to : null,
        parkCzk: x && x.parkCzk ? x.parkCzk : null, parkDays: x && x.parkDays ? x.parkDays : null, tripAdj: x && x.tripAdj ? x.tripAdj : null,
        around: d === side.around, best: Boolean(x && x.cost === min && costs.length > 1), disabled: Boolean(minDate && d < minDate),
      });
    }
    return out;
  }

  /**
   * Zvýrazněná věta k „nejbližším dnům“ při malém počtu výsledků: „V den odletu nemá Ryanair volný let – 13. 11. od 1 290 Kč“,
   * jinak nejlevnější den poblíž, je-li zřetelně levnější než zadaný (nebo zadaný den nemá cenu).
   */
  function nearHeadline(nb) {
    if (!nb) return null;
    const parts = [];
    for (const [what, x] of [['odletu', nb.out], ['návratu', nb.back]]) {
      if (!x || x.lowcostOnDay || !(x.lowcostNear || []).length) continue;
      // „nemá volný let“: nelétá, nebo je let vyprodaný (obojí ve zdrojích chybí stejně)
      const names = x.lowcostNames || [];
      const who = names.length > 1 ? `nemají ${names.slice(0, -1).join(', ')} ani ${names[names.length - 1]}` : names.length ? `nemá ${names[0]}` : 'nemají nízkonákladovky';
      const near = x.lowcostNear.slice().sort((a, b) => Math.abs(diffDays(x.around, a)) - Math.abs(diffDays(x.around, b)) || a.localeCompare(b)).slice(0, 2).sort();
      const price = d => { const y = (x.days || []).find(z => z.date === d); return y ? ` od ${kc(y.cost)}` : ''; };
      // nejlevnější den poblíž, pokud to není jeden z nejbližších
      const cheap = (x.days || []).filter(d => d.date !== x.around).reduce((m, d) => (!m || d.cost < m.cost ? d : m), null);
      const extra = cheap && !near.includes(cheap.date) ? ` · nejlevněji ${dm(cheap.date)} od ${kc(cheap.cost)}` : '';
      parts.push(`V den ${what} ${who} volný let – ${near.map(d => dm(d) + price(d)).join(', ')}${extra}`);
    }
    if (parts.length) return parts.join(' · ');
    const cheaper = [];
    for (const [what, x] of [['tam', nb.out], ['zpět', nb.back]]) {
      if (!x || !(x.days || []).length) continue;
      const on = x.days.find(d => d.date === x.around);
      const best = x.days.filter(d => d.date !== x.around).reduce((m, d) => (!m || d.cost < m.cost ? d : m), null);
      if (best && (!on || best.cost < on.cost * 0.9)) cheaper.push(`${what} ${dm(best.date)} od ${kc(best.cost)}`);
    }
    return cheaper.length ? `Levněji vedle: ${cheaper.join(' · ')}` : null;
  }

  /**
   * Výpadek Kiwi.com v tomto hledání → { level: 'down' | 'blocked' | 'partial', retryAfter, failed, others } nebo null.
   * others = zdroje, které i tak něco našly (Ryanair, Wizz Air dávají jen nejlevnější let dne).
   */
  function kiwiOutage(providers) {
    const k = (providers || []).find(p => p.id === 'kiwi');
    if (!k || !k.outage) return null;
    const others = providers.filter(p => (p.id === 'ryanair' || p.id === 'wizzair') && p.found > 0).map(p => p.id);
    return { level: k.outage, retryAfter: Math.max(0, Math.round(+k.retryAfter || 0)), failed: +k.failed || 0, others };
  }

  /* ---------- filtry času a přestupů (ve výpisu, bez nového hledání) ---------- */
  // Části dne podle hodiny odletu (místní čas): [klíč, popisek, od, do).
  const DAYPARTS = [['morning', 'Ráno', 5, 12], ['afternoon', 'Odpoledne', 12, 18], ['evening', 'Večer', 18, 24], ['night', 'Noc', 0, 5]];
  const PART_TXT = { morning: 'ráno', afternoon: 'odpoledne', evening: 'večer', night: 'v noci' };
  const freshTime = () => ({ out: [], back: [], arrBy: null, stops: null, maxDur: null, maxLay: null });
  const hm = m => m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) + ' min' : ''}` : `${m} min`;
  // „4 h 20“ (jako u odhadu cesty vlakem/busem)
  const hhmmTxt = m => { m = Math.round(m); return m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ' ' + pad(m % 60) : ''}` : `${m} min`; };
  const clock = s => { const x = String(s || ''); const h = +x.slice(11, 13), m = +x.slice(14, 16); return x.length >= 16 && Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null; };

  /** Část dne odletu letu, nebo null (čas neznámý). */
  function dayPart(l) {
    const m = l && l.hasTime ? clock(l.dep) : null;
    if (m == null) return null;
    const h = Math.floor(m / 60);
    const p = DAYPARTS.find(x => h >= x[2] && h < x[3]);
    return p ? p[0] : null;
  }
  /** Délka letu v minutách (i odhad, když chybí čas příletu), jinak null. */
  const legMinutes = l => (l && l.durationMin > 0 ? l.durationMin : l && l.estMin > 0 ? l.estMin : null);
  /** Nejdelší přestup letu v minutách; null = přímý let nebo časy úseků neznáme. */
  const maxLayover = l => (l && l.stops > 0 && Array.isArray(l.layovers) && l.layovers.length ? Math.max(...l.layovers.map(x => +x.min || 0)) : null);
  /** Přílet po hodině `by` (místní čas) nebo v noci (0–5 h; i po půlnoci dalšího dne). Ráno dalšího dne nevadí. */
  function arrLate(l, by) {
    const m = l && l.hasTime && l.arr ? clock(l.arr) : null;
    return m != null && (m > by * 60 || m < 5 * 60);
  }
  const timeActive = tf => Boolean(tf && ((tf.out || []).length || (tf.back || []).length || tf.arrBy != null || tf.stops != null || tf.maxDur || tf.maxLay));

  /**
   * Které filtry času a přestupů cesta porušuje: ['tOut', 'tBack', 'arrBy', 'stops', 'maxDur', 'maxLay'] (prázdné = projde).
   * tf = { out: [části dne odletu tam], back: [… zpět], arrBy: hodina (přílet nejpozději, tam i zpět), stops: max. přestupů,
   * maxDur: max. délka cesty jedním směrem (min), maxLay: max. délka jednoho přestupu (min) }.
   * Co o letu nevíme (čas, délku, časy úseků), filtr neskrývá.
   */
  function timeFails(t, tf) {
    const out = [];
    if (!t || !timeActive(tf)) return out;
    const legs = [t.out, t.back].filter(Boolean);
    const partOk = (l, parts) => { const p = dayPart(l); return p == null || parts.includes(p); };
    if ((tf.out || []).length && t.out && !partOk(t.out, tf.out)) out.push('tOut');
    if ((tf.back || []).length && t.back && !partOk(t.back, tf.back)) out.push('tBack');
    if (tf.arrBy != null && legs.some(l => arrLate(l, tf.arrBy))) out.push('arrBy');
    if (tf.stops != null && legs.some(l => (l.stops || 0) > tf.stops)) out.push('stops');
    if (tf.maxDur && legs.some(l => (legMinutes(l) || 0) > tf.maxDur)) out.push('maxDur');
    if (tf.maxLay && legs.some(l => (maxLayover(l) || 0) > tf.maxLay)) out.push('maxLay');
    return out;
  }
  const timeOk = (t, tf) => timeFails(t, tf).length === 0;

  /**
   * Přesná data s filtry času a přestupů: let jednoho směru, který filtrům svého směru vyhoví, ale žádná jeho kombinace
   * ze serveru ne (vadil let druhým směrem – třeba „odlet zpět ráno“, nebo „jen přímé“, když server poslal jen
   * levnější dvojice s přestupem jedním směrem), se složí s nejlevnějším letem druhým směrem, který filtrům svého
   * směru vyhoví – i když žádná jeho kombinace ze serveru filtry neprošla. Jinak by filtr schoval i lety, které mu
   * vyhovují („Jen přímé“ Praha → Vídeň: přímé lety tam i zpět jsou, jen ne v jedné kombinaci).
   * pre = kombinace po ostatních filtrech, vis = kombinace, které prošly všemi filtry, opts = { adults, openJaw, keep }
   * jako u composeTrip. → nové složené cesty (jen ze samostatných letenek), každá jednou.
   */
  function fillLegs(pre, vis, tf, opts = {}) {
    if (!timeActive(tf)) return [];
    const cost = l => l.czk + l.groundCzk + l.bagCzk;
    const one = (side, l) => timeFails(side === 'out' ? { out: l } : { back: l }, tf).length === 0;
    const added = [], ids = new Set();
    for (const [side, other] of [['out', 'back'], ['back', 'out']]) {
      const have = new Set((vis || []).filter(t => t[side]).map(t => legSig(t[side])));
      // lety druhým směrem, které filtrům svého směru vyhoví, každý jednou, od nejlevnějšího (cena složené cesty = součet letů)
      const seen = new Set();
      const partners = [...(vis || []), ...(pre || [])].filter(t => {
        const l = t[other];
        if (t.combined || !l || !Number.isFinite(cost(l)) || seen.has(legSig(l))) return false;
        seen.add(legSig(l));
        return one(other, l);
      }).sort((a, b) => cost(a[other]) - cost(b[other]));
      const done = new Set();
      for (const t of pre || []) {
        const l = t[side];
        if (!l || t.combined || have.has(legSig(l)) || done.has(legSig(l))) continue;
        done.add(legSig(l));
        if (!one(side, l)) continue;
        for (const p of partners) {
          const c = side === 'out' ? composeTrip(t, p, opts) : composeTrip(p, t, opts);
          if (c && (!opts.keep || opts.keep(c))) {
            if (!ids.has(c.id)) { ids.add(c.id); added.push(c); }
            break;
          }
        }
      }
    }
    return added;
  }

  /**
   * Nejrychlejší cesta tam i zpět ze dvou samostatných letenek (přesná data, srovnání s vlakem/busem): server posílá
   * nejlevnější kombinace, takže přímý let tam bývá jen s levným návratem s přestupem na celý den. Z letů v kombinacích
   * složí dvojici, jejíž pomalejší směr je nejkratší (při shodě nejlevnější). door(leg, side) → minuty od dveří ke
   * dveřím | null, opts = { adults, openJaw, keep } jako u composeTrip. → složená cesta | null
   */
  function fastPair(trips, door, opts = {}) {
    const legs = side => {
      const m = new Map();
      for (const t of trips || []) {
        const l = t[side];
        if (!l || t.combined || m.has(legSig(l))) continue;
        const d = door(l, side);
        if (d > 0) m.set(legSig(l), { t, d });
      }
      return [...m.values()];
    };
    const backs = legs('back');
    let best = null;
    for (const o of legs('out')) {
      for (const b of backs) {
        const d = Math.max(o.d, b.d);
        if (best && d > best.d) continue;
        const c = composeTrip(o.t, b.t, opts);
        if (!c || (opts.keep && !opts.keep(c))) continue;
        if (!best || d < best.d || c.perPersonCzk < best.c.perPersonCzk) best = { c, d };
      }
    }
    return best ? best.c : null;
  }

  /** Kolik nabídek skrývá každý filtr sám (by), všechny dohromady (any) a z kolika (total). */
  function timeHidden(trips, tf) {
    const by = {};
    let any = 0;
    for (const t of trips || []) {
      const f = timeFails(t, tf);
      if (f.length) any++;
      for (const k of f) by[k] = (by[k] || 0) + 1;
    }
    return { by, any, total: (trips || []).length };
  }

  /** Posuvník z rozsahu dat [a, b] v minutách: krok 15 / 30 / 60 min podle rozpětí. */
  function rangeOf(r) {
    if (!r) return null;
    const step = r[1] - r[0] > 600 ? 60 : r[1] - r[0] > 180 ? 30 : 15;
    const min = Math.max(step, Math.floor(r[0] / step) * step), max = Math.ceil(r[1] / step) * step;
    return max > min ? { min, max, step } : null;
  }
  /** Z dat výsledků: rozsah délky letu (dur) a nejdelšího přestupu (lay) pro posuvníky, nejvíc přestupů (maxStops). */
  function timeStats(trips) {
    const durs = [], lays = [];
    let maxStops = 0;
    for (const t of trips || []) {
      for (const l of [t.out, t.back]) {
        if (!l) continue;
        const d = legMinutes(l), w = maxLayover(l);
        if (d) durs.push(d);
        if (w != null) lays.push(w);
        maxStops = Math.max(maxStops, l.stops || 0);
      }
    }
    const span = a => (a.length ? [Math.min(...a), Math.max(...a)] : null);
    return { dur: rangeOf(span(durs)), lay: rangeOf(span(lays)), maxStops };
  }

  /** Čipy aktivních filtrů času a přestupů (opts.hidden = počty z timeHidden.by, opts.ret = zpáteční let). */
  function timeChips(tf, { hidden = {}, ret = true } = {}) {
    if (!timeActive(tf)) return [];
    const parts = list => DAYPARTS.filter(p => list.includes(p[0])).map(p => PART_TXT[p[0]]).join(', ');
    const out = [];
    const add = (key, label) => out.push({ key, label, hidden: hidden[key] || 0, time: true });
    if ((tf.out || []).length) add('tOut', `🛫 odlet ${ret ? 'tam ' : ''}${parts(tf.out)}`);
    if (ret && (tf.back || []).length) add('tBack', `🛬 odlet zpět ${parts(tf.back)}`);
    if (tf.arrBy != null) add('arrBy', tf.arrBy >= 24 ? 'přílet před půlnocí' : `přílet do ${tf.arrBy}:00`);
    if (tf.stops != null) add('stops', tf.stops === 0 ? 'bez přestupu' : `max. ${tf.stops} přestup`);
    if (tf.maxDur) add('maxDur', `⏱ cesta max. ${hm(tf.maxDur)}`);
    if (tf.maxLay) add('maxLay', `⌛ přestup max. ${hm(tf.maxLay)}`);
    return out;
  }

  /**
   * Aktivní filtry jako čipy: ze serveru (max. cena, jen přímé – zrušení = nové hledání, hidden = kolik nabídek skryly)
   * i z výpisu (🔥 jen výhodné, posuvník ceny, den odletu, vypnutá letiště, aerolinky, čas a přestupy – zruší se hned).
   * time = { hidden, ret } pro čipy času a přestupů (viz timeChips).
   */
  function activeFilters(filters, v = {}, names = {}, time = {}) {
    const f = filters || {};
    const h = f.hidden || {};
    const out = [];
    if (f.maxPrice) out.push({ key: 'maxPrice', label: `do ${kc(f.maxPrice)}`, hidden: h.maxPrice || 0, rerun: true });
    if (f.directOnly) out.push({ key: 'directOnly', label: 'jen přímé lety', hidden: h.directOnly || 0, rerun: true });
    if (v.onlyDeals) out.push({ key: 'onlyDeals', label: '🔥 jen výhodné' });
    if (v.maxPrice) out.push({ key: 'viewPrice', label: `max. ${kc(v.maxPrice)}` });
    if (v.outDate) out.push({ key: 'outDate', label: `odlet ${dm(v.outDate)}` });
    if (v.excludeOrigins && v.excludeOrigins.size) out.push({ key: 'origins', label: `bez ${[...v.excludeOrigins].join(', ')}` });
    if (v.carriers && v.carriers.size) out.push({ key: 'carriers', label: `jen ${[...v.carriers].map(c => names[c] || c).join(', ')}` });
    return out.concat(timeChips(v.time, time));
  }

  /** Málo výsledků: u konkrétního cíle méně než 3 kombinace, jinak méně než 3 destinace. */
  function isThin(res) {
    if (!res) return false;
    return res.mode === 'route' ? (res.top || []).length < 3 : (res.groups || []).length < 3;
  }

  // Velká přestupní letiště (stejná jako na serveru v longhaul.js), odkud bývá víc spojení než z domova.
  const HUBS = [['VIE', 'Vídeň', 'AT', 48.1103, 16.5697], ['MUC', 'Mnichov', 'DE', 48.3538, 11.7861], ['BER', 'Berlín', 'DE', 52.3667, 13.5033],
    ['FRA', 'Frankfurt', 'DE', 50.0333, 8.5706], ['BUD', 'Budapešť', 'HU', 47.4394, 19.2618], ['WAW', 'Varšava', 'PL', 52.1657, 20.9671],
    ['ZRH', 'Curych', 'CH', 47.4647, 8.5492]];
  const km = (a, b, c, d) => {
    const r = Math.PI / 180;
    const x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(x));
  };
  /**
   * Nejbližší přestupní letiště do 450 km, která hledání ještě neprošlo (ani jako odletová, ani jako přestupní).
   * Cíl sám (Berlín → „přidat Berlín“), letiště v zemi cíle a do 150 km od cíle (Bratislava → Vídeň) se nenabízejí.
   */
  function nearHubs(res, max = 3) {
    const at = res && (res.home || (res.origins || []).find(o => o.lat != null));
    if (!at || at.lat == null) return [];
    const dest = res.destination || {};
    const have = new Set([...(res.origins || []).map(o => o.iata), ...(res.hubs || []), ...(dest.airports || [])]);
    const labels = (res.destinationLabels || []).filter(Boolean);
    const destCc = new Set([...labels.map(x => x.cc), ...(dest.countries || [])].filter(Boolean));
    const nearDest = h => labels.some(x => Number.isFinite(x.lat) && Number.isFinite(x.lon) && km(x.lat, x.lon, h[3], h[4]) < 150);
    return HUBS.filter(h => !have.has(h[0]) && !destCc.has(h[2]) && !nearDest(h)).map(h => ({ iata: h[0], city: h[1], cc: h[2], km: km(at.lat, at.lon, h[3], h[4]) }))
      .filter(h => h.km <= 450).sort((a, b) => a.km - b.km).slice(0, max);
  }

  const CONT_KEY = { 'Asie': 'asia', 'Afrika': 'africa', 'Severní Amerika': 'namerica', 'Jižní Amerika': 'samerica', 'Oceánie': 'oceania', 'Evropa': 'europe' };
  const CONT = { asia: ['Asie', '🌏'], africa: ['Afrika', '🌍'], namerica: ['Severní a Střední Amerika', '🗽'], samerica: ['Jižní Amerika', '🌎'], oceania: ['Austrálie a Oceánie', '🦘'] };

  /**
   * Konkrétní úpravy hledání pro prázdný nebo chudý výsledek – každá je jedno kliknutí (patch formuláře → nové hledání).
   * form = formulář, se kterým se hledalo (položky Odkud/Kam jako {id,label,flag,type}); res = výsledek;
   * opts.country(cc) → { name, cont } (česky), opts.flag(cc) → vlajka. Vrací [{ key, label, patch }], nejslibnější první.
   * Cíl v dosahu vlaku/busu (res.ground, odhad ze serveru) → { key: 'ground', label, ground: true } – otevře spoje po zemi.
   * opts.time = { chips, any }: čipy filtrů času a přestupů (timeChips) a kolik nabídek skryly dohromady – ty, které
   * něco skryly, jdou úplně napřed jako { key, label, clear } (zruší se hned ve výpisu, bez nového hledání).
   */
  function smartActions(form, res, { today, country = () => null, flag = () => '', time = null } = {}) {
    const f = form || {};
    const r = res || {};
    const acts = [];
    const add = (key, label, patch) => acts.push({ key, label, patch });
    const hidden = (r.filters && r.filters.hidden) || {};
    const exact = f.dateMode === 'exact';
    const ret = f.trip === 'return';
    const tc = ((time && time.chips) || []).filter(c => c.hidden > 0).sort((a, b) => b.hidden - a.hidden);
    if (tc.length > 1) acts.push({ key: 'clearTime', label: `Zrušit filtry času a přestupů (skryly ${time.any || tc[0].hidden})`, clear: 'time' });
    for (const c of tc.slice(0, 3)) acts.push({ key: 'clear:' + c.key, label: `Zrušit „${c.label}“ (skryto ${c.hidden})`, clear: c.key });
    // Filtr, který nabídky opravdu skryl, je nejpravděpodobnější příčina.
    if (f.maxPrice && hidden.maxPrice) add('noPrice', `Zrušit limit ceny (skryl ${hidden.maxPrice})`, { maxPrice: '' });
    if (f.directOnly && hidden.directOnly) add('noDirect', `I lety s přestupem (skryto ${hidden.directOnly})`, { directOnly: false });
    // Blízký cíl: vlak nebo bus (když se to vyplatí, nebo když letadlem nic není).
    const g = r.ground;
    // cena jako ve srovnání nad nápovědou: u zpáteční cesty tam i zpět (jinak by vedle „od ~598 Kč tam i zpět“ stálo „od ~299 Kč“)
    if (g && g.min > 0 && (g.worth || !(r.groups || []).length)) acts.push({ key: 'ground', label: `🚆 Vlakem/busem ~${hhmmTxt(g.min)} · ${ret ? `tam i zpět od ~${kc(g.czk * 2)}` : `od ~${kc(g.czk)}`} (odhad)`, ground: true });
    if (exact) {
      const fl = +f.xFlex || 0;
      if (fl < 1) add('flex1', '± 1 den', { xFlex: 1 });
      if (fl < 3) add('flex3', '± 3 dny', { xFlex: 3 });
    } else {
      if ((f.outDays || []).length || (ret && (f.backDays || []).length)) add('anyDay', 'Libovolný den v týdnu', { outDays: [], backDays: [], len: 'custom' });
      if (f.dFrom && f.dTo && diffDays(f.dFrom, f.dTo) < 50) add('longer', `Delší termín (až do ${dm(addDays(f.dTo, 30))})`, { dTo: addDays(f.dTo, 30) });
      if (ret && f.nMax - f.nMin < 4) {
        const nMin = Math.max(0, f.nMin - 2), nMax = Math.min(45, f.nMax + 2);
        add('nights', `Víc nocí (${nMin}–${nMax})`, { nMin, nMax, len: 'custom' });
      }
    }
    // Přestupní letiště jako další místa odletu (okruh nestačí: hledá se jen 8 nejbližších letišť).
    const hubs = nearHubs(r, Math.max(0, Math.min(3, 5 - (f.from || []).length)));
    if (hubs.length) {
      add('hubs', `Přidat přestupní letiště (${hubs.map(h => h.city).join(', ')})`,
        { from: [...(f.from || []), ...hubs.map(h => ({ id: 'ap:' + h.iata, label: h.city, flag: flag(h.cc), type: 'airport' }))] });
    } else if ((+f.radius || 0) < 150) {
      add('radius', 'Letiště do 250 km', { radius: 250 });
    }
    // Cíl: letiště / město → celá země → světadíl (u Evropy „kamkoliv“).
    const kind = r.destination && r.destination.kind;
    const types = (f.to || []).map(x => x.type);
    const ccs = [...new Set((r.destinationLabels || []).map(x => x.cc).filter(Boolean))];
    const conts = [...new Set(ccs.map(cc => (country(cc) || {}).cont).filter(Boolean))];
    const contKey = conts.length === 1 ? CONT_KEY[conts[0]] : null;
    let europe = false;
    if (kind === 'airports' && ccs.length === 1 && !types.includes('country')) {
      const c = country(ccs[0]);
      if (c) add('country', `Celá země: ${c.name}`, { to: [{ id: 'cc:' + ccs[0], label: c.name, flag: flag(ccs[0]), type: 'country' }] });
    }
    if (kind !== 'anywhere' && !types.includes('continent') && contKey) {
      if (CONT[contKey]) add('continent', `Celý světadíl: ${CONT[contKey][0]}`, { to: [{ id: 'ct:' + contKey, label: CONT[contKey][0], flag: CONT[contKey][1], type: 'continent' }] });
      else europe = contKey === 'europe';
    }
    if (ret) add('oneway', 'Jen tam (zpáteční let pak zvlášť)', { trip: 'oneway' });
    if (f.maxPrice && !hidden.maxPrice) add('noPrice', 'Zrušit limit ceny', { maxPrice: '' });
    if (f.directOnly && !hidden.directOnly) add('noDirect', 'I lety s přestupem', { directOnly: false });
    if (exact && f.xOut) {
      // Celý měsíc odletu flexibilně, počet nocí ± 2 kolem zadaného.
      const first = f.xOut.slice(0, 8) + '01';
      const last = addDays(addDays(first, 32).slice(0, 8) + '01', -1);
      const patch = { dateMode: 'flex', dFrom: today && first < today ? today : first, dTo: last, outDays: [], backDays: [] };
      let txt = '';
      if (ret && f.xBack) {
        const n = Math.max(0, diffDays(f.xOut, f.xBack));
        Object.assign(patch, { len: 'custom', nMin: Math.max(n ? 1 : 0, n - 2), nMax: Math.min(45, n + 2) });
        txt = ` (${patch.nMin}–${patch.nMax} nocí)`;
      }
      const m = +f.xOut.slice(5, 7) - 1;
      add('month', `${m === 8 ? 'Celé' : 'Celý'} ${MONTHS[m]} flexibilně${txt}`, patch);
    }
    if (europe) add('anywhere', '🌍 Kamkoliv – kam se dá letět', { to: [] });
    // Každý klíč jen jednou (první výskyt má přednost).
    const seen = new Set();
    return acts.filter(a => !seen.has(a.key) && seen.add(a.key));
  }

  /* ---------- cesta přes víc měst: výběr letu na každý úsek ---------- */
  /**
   * costs[i][a] = cena letu a v úseku i (Kč/os.), links[i][a][b] = null, když se let b úseku i+1 po letu a stihne
   * (jinak důvod ze serveru), picks[i] = vybraný let úseku i nebo null. Vrací
   *  through[i][a] = cena nejlevnější celé cesty s letem a (ostatní úseky podle výběru; vlastní výběr úseku i se
   *                  nebere v úvahu – jde o to, kolik by stála cesta, kdyby si vybral tenhle let) nebo null,
   *  best = { picks, total } nejlevnější celá cesta podle výběru, nebo null (vybrané lety nejdou spojit).
   * ends = autem s návratem domů { from: [letiště odletu každého letu 1. úseku], to: [letiště příletu každého letu
   * posledního úseku] }: cesta se vrací na letiště, kde auto parkuje (jako nejlevnější kombinace ze serveru). Jen když
   * taková cesta s vybranými lety není (ručně vybraný návrat jinam), platí cesta bez této podmínky.
   */
  function multiPlan(costs, links, picks = [], ends = null) {
    const free = planLegs(costs, links, picks);
    const n = costs.length;
    if (!ends || n < 2) return free;
    let best = null;
    const through = free.through.map(row => row.map(() => null));
    for (const h of new Set(ends.from)) {
      const c = costs.map((row, i) => row.map((x, a) => ((i === 0 && ends.from[a] !== h) || (i === n - 1 && ends.to[a] !== h) ? Infinity : x)));
      const r = planLegs(c, links, picks);
      r.through.forEach((row, i) => row.forEach((v, a) => { if (v != null && (through[i][a] == null || v < through[i][a])) through[i][a] = v; }));
      if (r.best && (!best || r.best.total < best.total)) best = r.best;
    }
    return { through: through.map((row, i) => row.map((v, a) => (v != null ? v : free.through[i][a]))), best: best || free.best };
  }
  function planLegs(costs, links, picks) {
    const n = costs.length;
    const ok = (i, a) => picks[i] == null || picks[i] === a;
    const fits = (i, a, b) => !(links[i] && links[i][a] && links[i][a][b]);
    // f[i][a] = nejlevnější úseky 0..i končící letem a, g[i][a] = nejlevnější úseky i..n-1 začínající letem a
    const f = [], g = [];
    for (let i = 0; i < n; i++) {
      f[i] = costs[i].map((c, a) => {
        if (!i) return c;
        let m = Infinity;
        costs[i - 1].forEach((_, x) => { if (ok(i - 1, x) && fits(i - 1, x, a) && f[i - 1][x] < m) m = f[i - 1][x]; });
        return m + c;
      });
    }
    for (let i = n - 1; i >= 0; i--) {
      g[i] = costs[i].map((c, a) => {
        if (i === n - 1) return c;
        let m = Infinity;
        costs[i + 1].forEach((_, y) => { if (ok(i + 1, y) && fits(i, a, y) && g[i + 1][y] < m) m = g[i + 1][y]; });
        return m + c;
      });
    }
    const through = costs.map((row, i) => row.map((c, a) => { const v = f[i][a] + g[i][a] - c; return Number.isFinite(v) ? v : null; }));
    // nejlevnější cesta: g už počítá s výběrem v dalších úsecích, takže stačí brát nejlevnější navazující let
    const path = [];
    for (let i = 0; i < n; i++) {
      let best = -1;
      costs[i].forEach((_, a) => {
        if (!ok(i, a) || (i && !fits(i - 1, path[i - 1], a)) || !Number.isFinite(g[i][a])) return;
        if (best < 0 || g[i][a] < g[i][best]) best = a;
      });
      if (best < 0) return { through, best: null };
      path.push(best);
    }
    return { through, best: n ? { picks: path, total: g[0][path[0]] } : null };
  }

  /**
   * Proč se let nedá navázat (důvod ze serveru: early / short / nextday / unknown), česky. side = 'prev': tenhle let po
   * vybraném předchozím, 'next': po tomhle letu vybraný další.
   */
  function multiWhy(x, side = 'prev') {
    if (!x) return '';
    const next = side === 'next';
    if (x.why === 'early') return next ? 'přistane až po odletu vybraného dalšího letu' : 'odlétá dřív, než vybraný předchozí let přistane';
    // let s přestupem z cache bez známého příletu → další let nejdřív 24 h po jeho odletu
    if (x.why === 'unknown') return `${next ? 'tenhle let má' : 'vybraný předchozí let má'} přestup a neznámý přílet (z cache) – ${next ? 'další let' : 'tenhle let'} nejdřív ${hm(x.needMin || 1440)} po jeho odletu`;
    if (x.why === 'short') return `${next ? 'do odletu vybraného dalšího letu' : 'od příletu předchozího letu'} jen ${hm(Math.max(0, x.gapMin))} – ${x.move ? 's přejezdem do jiného města ' : ''}potřeba aspoň ${hm(x.needMin)}`;
    return next ? 'další let je z jiného letiště nebo bez času – musel by být nejdřív další den'
      : 'jiné letiště než přílet předchozího letu (nebo neznámý čas) – odlet nejdřív další den';
  }

  /* ---------- doprava na letiště (stejně jako server/lib/access.js) ---------- */

  const LEGACY_KM_RATE = 1.1; // dřív Kč/km s výchozími 1,1 – uložená hledání a hlídané ceny
  // Auto: pohon, jednotka, výchozí spotřeba na 100 km a meze spotřeby a vlastní ceny – jako server (access.js CAR_FUELS).
  const CAR_FUELS = {
    diesel: { name: 'nafta', unit: 'l', cons: 6, consRange: [2, 30], priceRange: [5, 150] },
    petrol: { name: 'benzín N95', unit: 'l', cons: 7, consRange: [2, 30], priceRange: [5, 150] },
    ev: { name: 'nabíjení', unit: 'kWh', cons: 19, consRange: [8, 40], priceRange: [1, 40] },
  };
  const FUEL_KEYS = ['diesel', 'petrol', 'ev'];
  const CAR_KM_CZK = 2.6; // dřívější výchozí Kč/km za auto (formulář s carKm, dotaz s carKmCzk)
  const FUEL_IN = { DE: 'v Německu', AT: 'v Rakousku', SK: 'na Slovensku', PL: 'v Polsku', HU: 'v Maďarsku' };
  const given = v => v != null && v !== '';
  const clamp = (x, r) => Math.min(r[1], Math.max(r[0], x));
  const comma = x => String(x).replace('.', ',');
  /** Cena za litr / kWh v popisku: nafta a benzín na haléře („50,65“), nabíjení celé bez desetin („16“, „8,50“). */
  const priceTxt = (fuel, x) => (CAR_FUELS[fuel] && CAR_FUELS[fuel].unit === 'l') || !Number.isInteger(x) ? x.toFixed(2).replace('.', ',') : String(x);

  /** Auto z dotazu / formuláře → { carFuel, carCons, carPrice, carKmCzk } – jako server (access.js normalizeCar). */
  function carOpts(raw) {
    const r = raw || {};
    if (!given(r.carFuel) && given(r.carKmCzk)) {
      const km = Number(r.carKmCzk);
      return { carFuel: null, carCons: null, carPrice: null, carKmCzk: km > 0 ? Math.round(clamp(km, [0.5, 10]) * 10) / 10 : CAR_KM_CZK };
    }
    const fuel = FUEL_KEYS.includes(r.carFuel) ? r.carFuel : 'diesel';
    const f = CAR_FUELS[fuel], cons = Number(r.carCons), price = Number(r.carPrice);
    return {
      carFuel: fuel,
      carCons: given(r.carCons) && cons > 0 ? Math.round(clamp(cons, f.consRange) * 10) / 10 : f.cons,
      carPrice: given(r.carPrice) && price > 0 ? Math.round(clamp(price, f.priceRange) * 100) / 100 : null,
      carKmCzk: null,
    };
  }

  /**
   * Cena pohonu auta – jako server (access.js carEnergy): { fuel, cons, unit, price, priceLabel, kmCzk, custom, country,
   * date, source } | null. info = odpověď /api/fuel (ceny po zemích, ev = nabíjení), cc = země domova (neznámá → ČR).
   * Bez cen (info ještě nedorazilo) jen s vlastní cenou, jinak null.
   */
  function carEnergy(raw, info, cc = 'CZ') {
    const c = carOpts(raw);
    if (!c.carFuel) return null;
    const f = CAR_FUELS[c.carFuel];
    let price, priceLabel, src;
    if (c.carPrice) {
      price = c.carPrice;
      priceLabel = `${f.name} ${priceTxt(c.carFuel, price)} Kč/${f.unit} · vlastní cena`;
      src = { country: null, date: null, source: 'custom' };
    } else if (c.carFuel === 'ev') {
      const ev = info && info.ev;
      if (!ev || !(ev.default > 0)) return null;
      price = ev.default;
      priceLabel = ev.label;
      src = { country: null, date: ev.date, source: 'ev' };
    } else {
      const has = k => /^[A-Z]{2}$/.test(k) && Boolean(info && info[k]) && Number.isFinite(info[k][c.carFuel]);
      const code = has(String(cc || '').toUpperCase()) ? String(cc).toUpperCase() : 'CZ';
      if (!has(code)) return null;
      const p = info[code];
      price = p[c.carFuel];
      priceLabel = `${f.name} ${priceTxt(c.carFuel, price)} Kč/l${FUEL_IN[code] ? ` ${FUEL_IN[code]}` : ''} · ${p.label}`;
      src = { country: code, date: p.date, source: p.source };
    }
    return { fuel: c.carFuel, cons: c.carCons, unit: f.unit, price, priceLabel, kmCzk: Math.round(c.carCons * price / 100 * 1e5) / 1e5, custom: Boolean(c.carPrice), ...src };
  }
  /** Palivo za cestu po silnici (Kč, jedním směrem) – jako server (access.js carAccess fuelCzk). */
  const fuelCzk = (roadKm, kmCzk) => Math.round(roadKm * kmCzk);
  /** „≈ 3,04 Kč/km“ bez ≈ – Kč/km na haléře. */
  const kmTxt = x => (Math.round(x * 100) / 100).toFixed(2).replace('.', ',');
  const FUEL_WORD = { diesel: 'nafta', petrol: 'benzín', ev: 'elektroauto' };
  /** „nafta 6 l/100 km ≈ 3,04 Kč/km“ (e = carEnergy nebo položka fuel z rozpisu cesty autem). */
  const energyTxt = e => (e && e.fuel ? `${FUEL_WORD[e.fuel]} ${comma(e.cons)} ${e.unit}/100 km ≈ ${kmTxt(e.kmCzk)} Kč/km` : '');
  /** Řádek s cenou ve formuláři: „nafta 50,65 Kč/l · ČSÚ, týden 28. 9.–4. 10.“ (u ČSÚ kratší než priceLabel). */
  function fuelLine(e) {
    if (!e) return '';
    if (e.source === 'czso' && /^\d{4}-\d{2}-\d{2}$/.test(e.date || '')) return `${CAR_FUELS[e.fuel].name} ${priceTxt(e.fuel, e.price)} Kč/l · ČSÚ, týden ${dm(e.date)}–${dm(addDays(e.date, 6))}`;
    return e.priceLabel;
  }
  /** Položka paliva z rozpisu cesty autem (ground.breakdown) s pohonem a cenou, jinak null (dřívější Kč/km, vypnuto). */
  const fuelItem = g => (g && (g.breakdown || []).find(x => x.k === 'fuel' && x.fuel)) || null;
  /**
   * Palivo jedním směrem za auto: „palivo 330 km × 6 l/100 km × 50,65 Kč/l = 1 003 Kč“ (elektroauto „nabíjení … kWh …“,
   * dřívější Kč/km „palivo 330 km × 2,6 Kč/km = 858 Kč“). g = ground autem ze serveru.
   */
  function fuelFormula(g) {
    if (!g || !(g.roadKm > 0)) return '';
    const e = fuelItem(g);
    if (e) return `${e.fuel === 'ev' ? 'nabíjení' : 'palivo'} ${g.roadKm} km × ${comma(e.cons)} ${e.unit}/100 km × ${priceTxt(e.fuel, e.price)} Kč/${e.unit} = ${kc(g.fuelCzk)}`;
    return `palivo ${g.roadKm} km × ${comma(g.carKmCzk)} Kč/km = ${kc(g.fuelCzk)}`;
  }

  /**
   * Formulář uložený dřív → dnešní tvar. Bez groundMode s kmRate v Kč/km → veřejnou dopravou, kmRate jako násobek
   * odhadu (1,1 → 1). Auto: carFuel + spotřeba a vlastní cena pro každý pohon zvlášť (carCons / carPrice = { diesel,
   * petrol, ev }); dřívější Kč/km za auto (carKm) jiné než výchozí 2,6 → vlastní cena nafty při 6 l/100 km (3 Kč/km =
   * 50 Kč/l), výchozí 2,6 → aktuální ceny. Formulář v dnešním tvaru vrací beze změny.
   */
  function groundForm(f) {
    if (!f || typeof f !== 'object') return f;
    let out = f;
    if (f.groundMode == null && f.kmRate != null) {
      const k = Number(f.kmRate);
      out = { ...out, groundMode: 'transit', kmRate: Number.isFinite(k) && k >= 0 ? Math.round(k / LEGACY_KM_RATE * 10) / 10 : 1 };
    }
    const obj = v => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
    if (FUEL_KEYS.includes(f.carFuel) && obj(f.carCons) && obj(f.carPrice) && !('carKm' in f)) return out;
    const cons = {}, price = {};
    for (const k of FUEL_KEYS) {
      const c = carOpts({ carFuel: k, carCons: obj(f.carCons) ? f.carCons[k] : null, carPrice: obj(f.carPrice) ? f.carPrice[k] : null });
      cons[k] = c.carCons;
      price[k] = c.carPrice;
    }
    const km = Number(f.carKm);
    if (!FUEL_KEYS.includes(f.carFuel) && km > 0 && Math.abs(km - CAR_KM_CZK) > 0.001) {
      price.diesel = carOpts({ carFuel: 'diesel', carPrice: km * 100 / cons.diesel }).carPrice;
    }
    const { carKm, ...rest } = out;
    return { ...rest, carFuel: FUEL_KEYS.includes(f.carFuel) ? f.carFuel : 'diesel', carCons: cons, carPrice: price };
  }
  /** Auto do dotazu z formuláře: { carFuel, carCons, carPrice? } – spotřeba a cena zvoleného pohonu. */
  function carPayload(f) {
    const fuel = FUEL_KEYS.includes(f && f.carFuel) ? f.carFuel : 'diesel';
    const c = carOpts({ carFuel: fuel, carCons: f && f.carCons && f.carCons[fuel], carPrice: f && f.carPrice && f.carPrice[fuel] });
    return { carFuel: c.carFuel, carCons: c.carCons, ...(c.carPrice ? { carPrice: c.carPrice } : {}) };
  }
  const tollSum = (g, pick) => (g.tolls || []).filter(pick).reduce((s, t) => s + t.czk, 0);
  /** Dní parkování pro cestu s N nocemi (odlet ráno, návrat večer = N + 1 započatých dní). */
  const parkDays = n => Math.max(1, Math.round(Number(n) || 0) + 1);
  /** Parkování za auto na `days` dní: základ + sazba za den (online předem) – jako server (access.js parkStay). */
  const parkStay = (g, days) => (Number(g.parkBaseCzk) || 0) + g.parkDayCzk * days;
  /** Autem tam i zpět s N nocemi: parkování (+ druhá známka, když první nevystačí), Kč/os. – jako server (access.js parkCzk). */
  function parkCzk(g, nights) {
    if (!g || g.mode !== 'car' || g.off || g.dropOff) return 0;
    const days = parkDays(nights);
    return Math.round((parkStay(g, days) + tollSum(g, t => t.days && days > t.days)) / (g.adults || 1));
  }
  /** Celá cesta autem: { days, perPerson, fuel, park, tolls, total } (za auto kromě perPerson) – jako server (access.js carTrip). */
  function carTrip(g, nights) {
    if (!g || g.mode !== 'car') return null;
    const once = tollSum(g, t => t.days), each = tollSum(g, t => !t.days);
    if (g.dropOff) return { days: 0, perPerson: g.czk, fuel: 2 * g.fuelCzk, park: 0, tolls: once + 2 * each, total: 2 * g.fuelCzk + once + 2 * each };
    const days = parkDays(nights), park = parkStay(g, days), tolls = once + tollSum(g, t => t.days && days > t.days) + 2 * each;
    return { days, perPerson: g.off ? 0 : 2 * g.czk + parkCzk(g, nights), fuel: 2 * g.fuelCzk, park, tolls, total: 2 * g.fuelCzk + park + tolls };
  }
  const r10 = n => Math.round(n / 10) * 10;
  const dnu = n => (n === 1 ? 'den' : n >= 2 && n <= 4 ? 'dny' : 'dní');
  const rate = x => String(x).replace('.', ',');
  /**
   * Cesta z domova na letiště odletu (g = ground ze serveru) pro štítek a popisek: veřejnou dopravou „~X Kč/os. tam“,
   * autem tam i zpět „~X Kč/os. vč. parkování na N dní“ (nights = délka cesty; Pardubice „…, parkování zdarma“), autem jen
   * tam odvoz. → { text, title } | null (doprava vypnutá nebo neznámá). Texty jsou čisté – do HTML jen přes esc().
   */
  function accessLabel(g, { nights = null } = {}) {
    if (!g || g.off || !(g.czk >= 0)) return null;
    if (g.mode === 'car') {
      const t = carTrip(g, nights), n = g.adults || 1, e = fuelItem(g);
      const tolls = (g.tolls || []).map(x => ` + ${x.label} ~${kc(x.days ? x.czk : 2 * x.czk)}`).join('');
      // palivo jedním směrem: km × spotřeba × aktuální cena, pak tam i zpět (dřívější dotaz: Kč/km)
      const fuel = e ? `${fuelFormula(g)}, tam i zpět ~${kc(t.fuel)}`
        : `palivo tam i zpět ${2 * g.roadKm} km × ${rate(g.carKmCzk)} Kč = ~${kc(t.fuel)}`;
      const src = e ? ` Cena: ${e.priceLabel}.${e.fuel === 'ev' ? ' Parkování a známky platí elektroauto stejně.' : ''}` : '';
      const per = `~${kc(t.total)} za auto, na osobu (${n} os.) ~${kc(t.perPerson)}`;
      if (g.dropOff) {
        return { text: `~${kc(r10(t.perPerson))}/os. (odvoz)`, title: `Autem jen tam: počítám, že tě někdo odveze a vrátí se (parkování neznámé) – ${fuel}${tolls} = ${per}. ~${hm(g.minutes)} jízdy.${src} Odhad.` };
      }
      // parkování online předem: základ + sazba za den (starší odpověď bez základu jen za den); základ i sazba 0 = zdarma
      const base = Number(g.parkBaseCzk) || 0;
      if (!base && !g.parkDayCzk) {
        return {
          text: `~${kc(r10(t.perPerson))}/os. tam i zpět, parkování zdarma`,
          title: `Autem ${g.roadKm} km (~${hm(g.minutes)}): ${fuel} + parkování u letiště zdarma${tolls} = ${per}.${src} Odhad.`,
        };
      }
      return {
        text: `~${kc(r10(t.perPerson))}/os. vč. parkování na ${t.days} ${dnu(t.days)}`,
        title: `Autem ${g.roadKm} km (~${hm(g.minutes)}): ${fuel} + parkování ${base ? `online předem ~${kc(base)} + ` : '~'}${kc(g.parkDayCzk)}/den × ${t.days} ${dnu(t.days)} = ~${kc(t.park)}${tolls} = ${per}.${src} Parkování ve výsledcích podle skutečné délky cesty. Odhad.`,
      };
    }
    const items = (g.breakdown || []).map(x => `${x.label} ~${kc(x.czk)}`);
    const sum = items.length > 1 ? `${items.join(' + ')} = ~${kc(g.czk)}` : items.length ? items[0] : `~${kc(g.czk)}`;
    return { text: `~${kc(g.czk)}/os. tam`, title: `Veřejnou dopravou: ${sum} na osobu jedním směrem (zpět totéž), ~${hm(g.minutes)}. Odhad podle vzdálenosti a ceníků dopravců, ne jízdní řád.` };
  }

  window.SearchHelp = {
    groundForm, parkDays, parkStay, parkCzk, carTrip, accessLabel,
    CAR_FUELS, carOpts, carEnergy, carPayload, fuelCzk, fuelItem, fuelFormula, fuelLine, energyTxt, kmTxt, priceTxt,
    legSig, returnFits, composeTrip, distinctLegs, sortLegs, pricedTimes, freeDeps, nearStrip, nearHeadline, kiwiOutage, activeFilters, isThin, nearHubs, smartActions, dm, addDays, diffDays,
    DAYPARTS, freshTime, dayPart, legMinutes, maxLayover, timeActive, timeFails, timeOk, fillLegs, fastPair, timeHidden, timeStats, timeChips, hm, multiPlan, multiWhy,
  };
})();
