/* ATLAS – pomoc s výsledky hledání letů: čistá logika bez DOM, aby šla testovat v node (test/searchhelp.test.js).
   Lety po jednotlivých letech u přesných dat, „nejbližší dny“, výpadek Kiwi.com, aktivní filtry a návrhy,
   jak hledání jedním kliknutím rozšířit, když je výsledků málo. */
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
   * letiště bez open-jaw nebo návrat dřív než 2 h po příletu → null.
   */
  function composeTrip(ot, bt, { adults = 1, openJaw = true } = {}) {
    const o = ot && ot.out, b = bt && bt.back;
    if (!o || !b || ot.combined || bt.combined) return null;
    if (![o, b].every(l => l.czk > 0 && Number.isFinite(l.groundCzk) && Number.isFinite(l.bagCzk))) return null;
    if (b.from !== o.to && !(openJaw && ot.destKey && ot.destKey === bt.destKey)) return null;
    if (b.to !== o.from && !openJaw) return null;
    if (b.date < o.date || !returnFits(o, b)) return null;
    const flightCzk = o.czk + b.czk, groundCzk = o.groundCzk + b.groundCzk, bagCzk = o.bagCzk + b.bagCzk;
    const perPersonCzk = flightCzk + groundCzk + bagCzk;
    return {
      id: [o.provider, o.from, o.to, o.dep, b.provider, b.from, b.to, b.dep].join('|'),
      out: o, back: b, flightCzk, groundCzk, bagCzk, bagEst: o.bagEst || b.bagEst || undefined,
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

  /**
   * Aktivní filtry jako čipy: ze serveru (max. cena, jen přímé – zrušení = nové hledání, hidden = kolik nabídek skryly)
   * i z výpisu (🔥 jen výhodné, posuvník ceny, den odletu, vypnutá letiště, aerolinky – zruší se hned).
   */
  function activeFilters(filters, v = {}, names = {}) {
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
    return out;
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
  /** Nejbližší přestupní letiště do 450 km, která hledání ještě neprošlo (ani jako odletová, ani jako přestupní). */
  function nearHubs(res, max = 3) {
    const at = res && (res.home || (res.origins || []).find(o => o.lat != null));
    if (!at || at.lat == null) return [];
    const have = new Set([...(res.origins || []).map(o => o.iata), ...(res.hubs || [])]);
    return HUBS.filter(h => !have.has(h[0])).map(h => ({ iata: h[0], city: h[1], cc: h[2], km: km(at.lat, at.lon, h[3], h[4]) }))
      .filter(h => h.km <= 450).sort((a, b) => a.km - b.km).slice(0, max);
  }

  const CONT_KEY = { 'Asie': 'asia', 'Afrika': 'africa', 'Severní Amerika': 'namerica', 'Jižní Amerika': 'samerica', 'Oceánie': 'oceania', 'Evropa': 'europe' };
  const CONT = { asia: ['Asie', '🌏'], africa: ['Afrika', '🌍'], namerica: ['Severní a Střední Amerika', '🗽'], samerica: ['Jižní Amerika', '🌎'], oceania: ['Austrálie a Oceánie', '🦘'] };

  /**
   * Konkrétní úpravy hledání pro prázdný nebo chudý výsledek – každá je jedno kliknutí (patch formuláře → nové hledání).
   * form = formulář, se kterým se hledalo (položky Odkud/Kam jako {id,label,flag,type}); res = výsledek;
   * opts.country(cc) → { name, cont } (česky), opts.flag(cc) → vlajka. Vrací [{ key, label, patch }], nejslibnější první.
   */
  function smartActions(form, res, { today, country = () => null, flag = () => '' } = {}) {
    const f = form || {};
    const r = res || {};
    const acts = [];
    const add = (key, label, patch) => acts.push({ key, label, patch });
    const hidden = (r.filters && r.filters.hidden) || {};
    const exact = f.dateMode === 'exact';
    const ret = f.trip === 'return';
    // Filtr, který nabídky opravdu skryl, je nejpravděpodobnější příčina.
    if (f.maxPrice && hidden.maxPrice) add('noPrice', `Zrušit limit ceny (skryl ${hidden.maxPrice})`, { maxPrice: '' });
    if (f.directOnly && hidden.directOnly) add('noDirect', `I lety s přestupem (skryto ${hidden.directOnly})`, { directOnly: false });
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

  window.SearchHelp = { legSig, returnFits, composeTrip, distinctLegs, sortLegs, pricedTimes, freeDeps, nearStrip, nearHeadline, kiwiOutage, activeFilters, isThin, nearHubs, smartActions, dm, addDays, diffDays };
})();
