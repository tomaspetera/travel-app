/* ATLAS – doporučené pořadí nabídek: výchozí řazení „Doporučené“ ve výsledcích hledání a pořadí karet radaru „Kam
   letět levně“. Čistá logika bez DOM (test/rank.test.js). Kdy z domu a kdy doma počítá SearchHelp.reach – stejně jako
   štítky ⏰ / 🏠 u nabídky – proto se načítá až po searchhelp.js.

   Nejlevnější letenka nebývá nejlepší volba: letenka z Brna o 200 Kč levnější, když cesta na letiště stojí 700 Kč
   a 7 hodin; odlet v 6:00 z letiště, kam v noci nic nejede; víkend s příletem v sobotu večer a odletem v neděli ráno.
   Každá nabídka proto dostane SROVNÁVACÍ CENU v Kč na osobu: co zaplatíš, plus přirážky za to, co tě stojí jinak než
   penězi, minus sleva za cenu zřetelně pod obvyklou. Všechno v korunách a s pevnými vahami (W) – nic se neučí, nic se
   nestahuje, pořadí jde vysvětlit jednou větou (štítek „proč výš“, reasons) a rozpisem (explain).

     cena       letenka + zavazadla + odhad cesty na letiště a z letiště do města (tripCzk ze serveru)
     cesta      hodiny z domova na letiště a z letiště do města, tam i zpět, × 150 Kč (čas, který je jen cesta)
     přestup    čas navíc proti přímému letu × 150 Kč/h; přestup 6 h a víc (často přes noc) navíc +500 Kč
     noc        z domu před 4:30 / domů po 0:30 (SearchHelp.reach): veřejnou dopravou mimo tvoje město +700 Kč
                (nic nejede – taxi, noc na letišti), jinak +250 Kč (jen nevyspání); v cíli do města po 23:30 nebo
                z města před 4:30 +300 Kč (noční taxi)
     pobyt      na místě přes den (8–22 h) méně než 85 % z 12 h na noc → přirážka až 80 % ceny (cesta, ze které skoro
                nic nezbude)
     výhodnost  letenka aspoň o 15 % pod obvyklou cenou do cíle (medián nabídek hledání z aspoň 5, „Je to dobrá
                cena?“ = dobrá) a aspoň o 10 procentních bodů hlouběji, než bývá nejlevnější nabídka cílů tohoto hledání
                (minimum je pod mediánem vždy) → sleva o ten rozdíl navíc, nejvýš 25 % ceny
   Pestrost (order): každý další cíl ze stejné země v pořadí o 8 % dražší (nejvýš 5×) – nahoře ne pětkrát Německo.
   Řazení „Nejlevnější letenka“ a ostatní zůstávají čistě podle svého klíče. */
(function () {
  'use strict';
  const W = {
    hourCzk: 150, // Kč za hodinu cesty na letiště, do města a na přestupech (řazení „Cena + délka cesty“ má 250)
    layUnknownMin: 180, // přestup bez známé délky: tolik minut navíc na každý
    layNightMin: 360, layNightCzk: 500, // dlouhý přestup (bývá přes noc)
    nightHome: 700, nightSoft: 250, nightCity: 300,
    stayFrom: 8, stayTo: 22, stayHours: 12, stayOk: 0.85, stayMax: 0.8,
    dealMin: 0.15, dealEdge: 0.1, dealShare: 1, dealCap: 0.25, dealN: 5,
    sameCountry: 0.08, sameMax: 5,
  };
  const HOUR = 3600e3, DAY = 864e5;
  const SH = () => window.SearchHelp;
  const kc = n => `${Math.round(n).toLocaleString('cs-CZ')} Kč`;
  const hm = m => SH().hm(Math.round(m));
  // místní čas „YYYY-MM-DDTHH:MM“ jako ms (bez pásma – porovnávají se časy téhož místa)
  const localMs = s => { const x = Date.parse(String(s || '').slice(0, 16) + ':00Z'); return Number.isFinite(x) && String(s).length >= 16 ? x : null; };
  const dayMin = x => (((x % DAY) + DAY) % DAY) / 60000;
  const okGround = g => Boolean(g && !g.off && g.minutes > 0);
  const aMin = a => (a && a.min > 0 ? a.min : 0);
  const tripOf = t => (Number.isFinite(t.tripCzk) ? t.tripCzk : t.perPersonCzk);

  /** Hodiny „přes den“ (stayFrom–stayTo místního času) mezi dvěma okamžiky a < b (ms místního času). */
  function dayHours(a, b, from = W.stayFrom, to = W.stayTo) {
    if (!(b > a)) return 0;
    let h = 0;
    for (let d = Math.floor(a / DAY) * DAY; d < b; d += DAY) {
      const s = Math.max(a, d + from * HOUR), e = Math.min(b, d + to * HOUR);
      if (e > s) h += (e - s) / HOUR;
    }
    return h;
  }

  /**
   * Čas přestupů letu l (km = vzdálenost cesty) → { min: minuty navíc proti přímému letu, lay: nejdelší přestup | null }.
   * Přímý let 0; známá délka letu proti odhadu přímého (780 km/h + 35 min jako server), jinak součet přestupů, jinak
   * layUnknownMin na každý přestup (neznámé nemá vypadat jako krátké).
   */
  function layover(l, km) {
    if (!l || !(l.stops > 0)) return { min: 0, lay: null };
    const lay = SH().maxLayover(l), dur = SH().legMinutes(l);
    const direct = Number(km) > 0 ? km / 780 * 60 + 35 : null;
    const sum = Array.isArray(l.layovers) && l.layovers.length ? l.layovers.reduce((s, x) => s + (+x.min || 0), 0) : null;
    const min = dur && direct ? Math.max(0, dur - direct) : sum != null ? sum : W.layUnknownMin * l.stops;
    return { min: Math.round(min), lay };
  }

  /**
   * Srovnávací cena nabídky t (Kč/os.) a její rozpis. ctx (ctxOf): ground(iata) = doprava na letiště domova
   * (origins[].ground), arrival(iata) = z letiště do města ({ min }), stats(destKey) = priceStats cíle, cc(destKey) = země,
   * level(t) = „Je to dobrá cena?“, memo = WeakMap (skóre se počítá jednou na nabídku).
   * → { czk, base (letenka + zavazadla), trip (i s cestou), parts: { ground, access, lay, night, stay, deal } v Kč,
   *     accessMin, layMin, notes: [{ txt, czk }] (noční časy), dayH / refH (hodiny přes den na místě / očekávané), pct }
   */
  function score(t, ctx = {}) {
    if (ctx.memo && ctx.memo.has(t)) return ctx.memo.get(t);
    const h = SH();
    const base = t.perPersonCzk, trip = tripOf(t);
    const cc = ctx.cc ? ctx.cc(t.destKey) : null;
    const gOut = ctx.ground ? ctx.ground(t.out.from) : null, gBack = t.back && ctx.ground ? ctx.ground(t.back.to) : null;
    const aOut = ctx.arrival ? ctx.arrival(t.out.to) : null, aBack = t.back && ctx.arrival ? ctx.arrival(t.back.from) : null;
    // cesta: na letiště a z letiště domů (jen když ji hledání počítá) a z letiště do města tam i zpět
    const homeMin = (okGround(gOut) ? gOut.minutes : 0) + (okGround(gBack) ? gBack.minutes : 0), cityMin = aMin(aOut) + aMin(aBack);
    const accessMin = homeMin + cityMin;
    // přestupy
    const lo = layover(t.out, t.distanceKm), lb = layover(t.back, t.distanceKm);
    const layMin = lo.min + lb.min, longLay = Math.max(lo.lay || 0, lb.lay || 0);
    let lay = layMin / 60 * W.hourCzk;
    if (longLay >= W.layNightMin) lay += W.layNightCzk;
    // noc: z domu a domů (stejně jako štítky u nabídky), v cíli do města a z města
    const notes = [];
    const before = h.beforeFor(cc);
    const r = h.reach(t, okGround(gOut) ? gOut : null, okGround(gBack) ? gBack : null, { before });
    if (r.out && r.out.early) notes.push({ txt: `z domu už ${h.ve(r.out.min)} ${r.out.clock}${r.out.warn ? ' (v noci veřejná doprava nejede)' : ''}`, czk: r.out.warn ? W.nightHome : W.nightSoft });
    if (r.back && r.back.late) notes.push({ txt: `domů až ~${r.back.clock}${r.back.warn ? ' (v noci veřejná doprava nejede)' : ''}`, czk: r.back.warn ? W.nightHome : W.nightSoft });
    const oa = t.out.hasTime && t.out.arr && !t.out.arrUnknown ? localMs(t.out.arr) : null;
    const cityIn = oa != null ? oa + (h.REACH.after + aMin(aOut)) * 60000 : null;
    const bd = t.back && t.back.hasTime ? localMs(t.back.dep) : null;
    const cityOut = bd != null ? bd - (before + aMin(aBack)) * 60000 : null;
    if (cityIn != null && (dayMin(cityIn) >= 23.5 * 60 || dayMin(cityIn) < 5 * 60)) notes.push({ txt: `v cíli do města až ~${h.clockTxt(dayMin(cityIn))}`, czk: W.nightCity });
    if (cityOut != null && dayMin(cityOut) < h.REACH.early) notes.push({ txt: `z města na letiště už ~${h.clockTxt(dayMin(cityOut))}`, czk: W.nightCity });
    const night = notes.reduce((s, n) => s + n.czk, 0);
    // pobyt: hodiny přes den mezi příjezdem do města a odjezdem z něj proti 12 h na noc
    let stay = 0, dayH = null, refH = null;
    if (t.back && cityIn != null && cityOut != null) {
      const n = Math.max(1, Number.isFinite(t.nights) ? t.nights : SH().diffDays(t.out.date, t.back.date));
      refH = n * W.stayHours;
      dayH = Math.round(dayHours(cityIn, cityOut) * 10) / 10;
      const ratio = dayH / refH;
      if (ratio < W.stayOk) stay = Math.min(1, (W.stayOk - ratio) / W.stayOk) * W.stayMax * trip;
    }
    // výhodnost: jen dobrá cena („Je to dobrá cena?“) zřetelně pod mediánem nabídek do cíle. Nejlevnější nabídka cíle
    // je pod mediánem skoro vždy (je to minimum) – sleva proto jen za to, oč je pod mediánem víc než nejlevnější nabídky
    // cílů obvykle (ctx.dealBase = medián poměru nejlevnější / medián přes cíle hledání)
    let deal = 0, pct = null;
    const st = ctx.stats ? ctx.stats(t.destKey) : null;
    const pl = ctx.level ? ctx.level(t) : t.priceLevel;
    if (pl && pl.level === 'low' && st && st.n >= W.dealN && st.median > 0 && t.flightCzk > 0) {
      const q = t.flightCzk / st.median, edge = (ctx.dealBase ?? 1 - W.dealMin) - q;
      if (1 - q >= W.dealMin && edge >= W.dealEdge) {
        pct = Math.round((1 - q) * 100);
        deal = -Math.min(W.dealShare * edge * st.median, W.dealCap * trip);
      }
    }
    const parts = { ground: Math.round(trip - base), access: Math.round(accessMin / 60 * W.hourCzk), lay: Math.round(lay), night, stay: Math.round(stay), deal: Math.round(deal) };
    const sc = {
      czk: base + parts.ground + parts.access + parts.lay + parts.night + parts.stay + parts.deal,
      base, trip, parts, accessMin, homeMin, cityMin, layMin, longLay: longLay || null, notes, dayH, refH, pct, median: st ? st.median : null,
    };
    if (ctx.memo) ctx.memo.set(t, sc);
    return sc;
  }

  /** Rozpis srovnávací ceny jednou větou (title štítku). */
  function explain(sc) {
    const p = sc.parts, out = [`letenka ${kc(sc.base)}`];
    if (p.ground) out.push(`cesta na letiště a do města +${kc(p.ground)}`);
    if (p.access) out.push(`${hm(sc.accessMin)} na cestě na letiště a do města +${kc(p.access)}`);
    if (p.lay) out.push(`přestup${sc.longLay ? ` ${hm(sc.longLay)}` : ''} +${kc(p.lay)}`);
    for (const n of sc.notes) out.push(`${n.txt} +${kc(n.czk)}`);
    if (p.stay) out.push(`na místě jen ~${Math.round(sc.dayH)} h přes den z ~${sc.refH} h +${kc(p.stay)}`);
    if (p.deal) out.push(`o ${sc.pct} % pod obvyklou cenou −${kc(-p.deal)}`);
    return `srovnávací cena ~${kc(sc.czk)} (${out.join(', ')})`;
  }

  /**
   * Pořadí s pestrostí: items seřazené podle key (srovnávací cena) – každý další cíl ze země, která už v pořadí je, se
   * porovná s cenou o sameCountry dražší za každý předchozí (nejvýš sameMax×). Stabilní; bez země (cc = '') bez přirážky.
   * → nové pole.
   */
  function order(items, key, ccOf = () => '') {
    const rest = items.map((x, i) => ({ x, i, k: Number(key(x)), c: ccOf(x) || '' }))
      .map(r => ({ ...r, k: Number.isFinite(r.k) ? r.k : Infinity }))
      .sort((a, b) => a.k - b.k || a.i - b.i);
    const out = [], seen = new Map();
    while (rest.length) {
      let bi = 0, bv = Infinity;
      for (let j = 0; j < rest.length; j++) {
        const r = rest[j];
        if (r.k >= bv) break; // přirážka je ≥ 0 – dál už nic levnějšího není
        const v = r.k * (1 + W.sameCountry * Math.min(W.sameMax, (r.c && seen.get(r.c)) || 0));
        if (v < bv) { bv = v; bi = j; }
      }
      const [r] = rest.splice(bi, 1);
      if (r.c) seen.set(r.c, (seen.get(r.c) || 0) + 1);
      out.push(r.x);
    }
    return out;
  }

  /** Nabídka s nejnižší srovnávací cenou (při shodě levnější letenka) z trips, nebo null. */
  function pick(trips, ctx) {
    let best = null, bs = null;
    for (const t of trips || []) {
      if (!t || !t.out) continue;
      const s = score(t, ctx);
      if (!best || s.czk < bs.czk || (s.czk === bs.czk && t.perPersonCzk < best.perPersonCzk)) { best = t; bs = s; }
    }
    return best;
  }

  const SHORT = { airport: 'i s cestou na letiště nejlevnější', airportLess: 'levnější i s cestou na letiště', ground: 'levnější cesta na letiště', access: 'kratší cesta na letiště', city: 'letiště blíž městu', lay: 'bez dlouhého přestupu', night: 'rozumné časy', stay: 'víc času na místě', mix: 'pestřejší výběr' };

  /**
   * Proč je položka výš než levnější letenka. list = položky v konečném pořadí [{ t, sc, label, cc, alt?, minTrip? }]
   * (alt = jiná nabídka téhož cíle s levnější letenkou, { t, sc } – s ní by cíl stál v řazení „Nejlevnější letenka“;
   * minTrip = nejnižší cena i s cestou na letiště a do města mezi nabídkami cíle – „nejlevnější“ musí platit), n = kolik
   * prvních položek štítek může dostat. Štítek dostane jen položka, která předběhla levnější letenku (cíl níž v pořadí,
   * nebo levnější nabídku svého cíle) – vybere se nejlevnější z nich a složka srovnávací ceny, ve které je tahle nejvíc
   * lepší. → Map index → { k, text, title } (texty bez HTML).
   */
  function reasons(list, n = 10) {
    const out = new Map();
    const low = y => (y.alt && y.alt.t !== y.t && y.alt.t.perPersonCzk < y.t.perPersonCzk ? { ...y.alt, label: y.label } : y);
    const lows = list.map(low);
    // nejnižší cena i s cestou, kterou cíl má (zvolená nabídka, levnější letenka, kterákoli jeho nabídka)
    const floor = y => Math.min(tripOf(y.t), y.alt ? tripOf(y.alt.t) : Infinity, Number.isFinite(y.minTrip) ? y.minTrip : Infinity);
    for (let i = 0; i < Math.min(n, list.length); i++) {
      const x = list[i], p = x.t.perPersonCzk;
      let r = lows[i] !== x ? { ...lows[i], own: true } : null;
      for (let j = i + 1; j < list.length; j++) { const y = lows[j]; if (y.t.perPersonCzk < p && (!r || y.t.perPersonCzk < r.t.perPersonCzk)) r = y; }
      if (!r) continue;
      // o kolik Kč srovnávací ceny je tahle v každé složce lepší než levnější letenka r – vyhraje největší rozdíl
      const d = k => (r.sc.parts[k] || 0) - (x.sc.parts[k] || 0);
      const dt = k => ((r.sc[k] || 0) - (x.sc[k] || 0)) / 60 * W.hourCzk;
      // i s cestou na letiště a do města levnější než r: cena i čas té cesty jsou jeden důvod – „levnější i s cestou“
      // („nejlevnější“ jen když je i s cestou nejlevnější z celého seznamu, i proti položkám nad sebou); jinak zvlášť
      // „levnější cesta na letiště“, „kratší cesta na letiště“, „letiště blíž městu“
      const cheaperTrip = tripOf(x.t) < tripOf(r.t);
      const cand = (cheaperTrip ? [['ground', d('ground') + dt('homeMin') + dt('cityMin')]] : [['ground', d('ground')], ['access', dt('homeMin')], ['city', dt('cityMin')]])
        .concat([['lay', d('lay')], ['night', d('night')], ['stay', d('stay')], ['deal', d('deal')]])
        .sort((a, b) => b[1] - a[1]);
      let k = cand[0][1] > 0 ? cand[0][0] : 'mix';
      if (k === 'ground' && cheaperTrip) {
        k = list.every(y => floor(y) >= tripOf(x.t)) ? 'airport' : 'airportLess';
      }
      const route = y => `${y.t.out.from} → ${y.t.out.to}${y.t.back && y.t.back.to !== y.t.out.from ? ` ↩ ${y.t.back.to}` : ''}, ${SH().dm(y.t.out.date)}${y.t.back ? `–${SH().dm(y.t.back.date)}` : ''}`;
      const who = r.own ? `Varianta ${route(r)}` : `${r.label} (${route(r)})`;
      const long = {
        airport: `i s cestou na letiště a do města tahle vyjde na ~${kc(tripOf(x.t))}, ${r.own ? 'ta' : 'tamta'} na ~${kc(tripOf(r.t))}`,
        airportLess: `i s cestou na letiště a do města tahle vyjde na ~${kc(tripOf(x.t))}, ${r.own ? 'ta' : 'tamta'} na ~${kc(tripOf(r.t))}`,
        ground: `cesta na letiště a do města tu stojí ~${kc(x.sc.parts.ground)}, tam ~${kc(r.sc.parts.ground)}`,
        access: `cesta z domova na letiště a zpět trvá ~${hm(x.sc.homeMin)} proti ~${hm(r.sc.homeMin)}`,
        city: `z letiště do města a zpět je to ~${hm(x.sc.cityMin)} proti ~${hm(r.sc.cityMin)}`,
        lay: `${r.own ? 'ta' : 'tamta'} má přestup${r.sc.longLay ? ` ${hm(r.sc.longLay)}` : ''}`,
        night: `${r.own ? 'ta' : 'tamta'}: ${r.sc.notes.map(z => z.txt).join(', ') || 'nevhodné časy'}`,
        stay: `z ${r.own ? 'té' : 'tamté'} zbude na místě ~${Math.round(r.sc.dayH || 0)} h přes den, z téhle ~${Math.round(x.sc.dayH || 0)} h`,
        deal: `tahle je o ${x.sc.pct} % pod obvyklou cenou do cíle (polovina nabídek nejvýš ${kc(x.sc.median || 0)})`,
        mix: 'ze stejné země je výš už jiný cíl – pořadí střídá země',
      }[k];
      const text = k === 'deal' ? `o ${x.sc.pct} % pod obvyklou cenou` : SHORT[k];
      out.set(i, { k, text, title: `${who} má levnější letenku (${kc(r.t.perPersonCzk)}), ale ${long}. Doporučené pořadí: ${explain(x.sc)}.` });
    }
    return out;
  }

  /**
   * Kontext skóre z výsledku hledání: doprava na letiště z origins, cesta do města z arrivals, statistika cen a země cíle
   * ze skupin (u konkrétního cíle statistika celé trasy). opts.level = úroveň ceny nabídky (výchozí t.priceLevel).
   */
  function ctxOf(res, opts = {}) {
    const ground = new Map(((res && res.origins) || []).filter(o => o && o.iata).map(o => [o.iata, o.ground || null]));
    const arr = (res && res.arrivals) || {};
    const groups = ((res && res.groups) || []).filter(g => g && g.dest);
    const stats = new Map(groups.map(g => [g.dest.key, g.priceStats || null]));
    const cc = new Map(groups.map(g => [g.dest.key, g.dest.cc || null]));
    const route = (res && res.priceStats) || null;
    // jak hluboko pod mediánem cíle bývá jeho nejlevnější letenka (medián přes cíle s aspoň dealN nabídkami)
    const qs = groups.filter(g => g.priceStats && g.priceStats.n >= W.dealN && g.priceStats.median > 0 && g.minFlightCzk > 0)
      .map(g => g.minFlightCzk / g.priceStats.median).sort((a, b) => a - b);
    const dealBase = qs.length >= W.dealN ? qs[Math.floor((qs.length - 1) / 2)] : null;
    return {
      dealBase,
      ground: iata => ground.get(iata) || null,
      arrival: iata => arr[iata] || null,
      stats: key => stats.get(key) || route,
      cc: key => cc.get(key) || null,
      level: opts.level || (t => t.priceLevel || null),
      memo: new WeakMap(),
    };
  }

  /**
   * Radar (SearchHelp.radarPick): z nabídek cíle ta s nejnižší srovnávací cenou, cíle v doporučeném pořadí s pestrostí.
   * → { pick(trips), order([{ g, t }]) }
   */
  function radar(ctx) {
    return {
      pick: trips => pick(trips, ctx),
      order: pairs => order(pairs, p => score(p.t, ctx).czk, p => p.g.dest && p.g.dest.cc),
    };
  }

  window.Rank = { W, dayHours, layover, score, explain, order, pick, reasons, ctxOf, radar };
})();
