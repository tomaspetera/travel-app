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
     noc        cesta z domu na letiště začne před 4:30 dne letu (SearchHelp.reach: ⏰ z domu brzy; i večer předem nebo
                let před 4:30), cesta domů skončí po 0:30 (🏠 domů pozdě; i ráno po 5:00 po celé noci v autobuse) nebo
                začne přistáním před 5:00 – noc na cestě. Jen podle hodiny (jako štítky ⏰ / 🏠) by ranní let z Vídně
                v 6:00, kam se z Prahy vyráží ve 22:45, vyšel líp než v 9:00 s odjezdem v 1:45 a přílet ve 23:30 s domovem
                v 5:30 líp než ve 20:00 s domovem ve 2:00. Veřejnou dopravou mimo tvoje město +700 Kč (nic nejede – taxi,
                noc na letišti), autem a z letiště ve tvém městě +250 Kč (jen nevyspání); v cíli do města po 23:30 nebo
                z města před 4:30 +300 Kč (noční taxi)
     pobyt      na místě přes den (8–22 h) méně než 85 % z 12 h na noc → přirážka až 80 % ceny (cesta, ze které skoro
                nic nezbude)
     výhodnost  letenka aspoň o 15 % pod obvyklou cenou do cíle (medián nabídek hledání z aspoň 5, „Je to dobrá
                cena?“ = dobrá) a aspoň o 10 procentních bodů hlouběji, než bývá nejlevnější nabídka cílů tohoto hledání
                (minimum je pod mediánem vždy) → sleva o ten rozdíl navíc, nejvýš 25 % ceny
   Pestrost (order): každý další cíl ze stejné země v pořadí o 8 % dražší (nejvýš 3×, tj. +24 %) – nahoře ne pětkrát
   Německo. Strop: odhady cesty (průměrné jízdné, ocenění času) jsou přesné asi na pětinu, větší rozdíl je opravdu horší
   nabídka – s dřívějšími 5× (+40 %) předběhla v demu „k moři v květnu“ o 39 % horší Mallorca Terst jen proto, že výš už
   bylo pět italských cílů. Řazení „Nejlevnější letenka“ a ostatní zůstávají čistě podle svého klíče. */
(function () {
  'use strict';
  const W = {
    hourCzk: 150, // Kč za hodinu cesty na letiště, do města a na přestupech (řazení „Cena + délka cesty“ má 250)
    layUnknownMin: 180, // přestup bez známé délky: tolik minut navíc na každý
    layNightMin: 360, layNightCzk: 500, // dlouhý přestup (bývá přes noc)
    nightHome: 700, nightSoft: 250, nightCity: 300,
    stayFrom: 8, stayTo: 22, stayHours: 12, stayOk: 0.85, stayMax: 0.8,
    dealMin: 0.15, dealEdge: 0.1, dealShare: 1, dealCap: 0.25, dealN: 5,
    sameCountry: 0.08, sameMax: 3,
  };
  const HOUR = 3600e3, DAY = 864e5;
  const SH = () => window.SearchHelp;
  const kc = n => `${Math.round(n).toLocaleString('cs-CZ')} Kč`;
  const hm = m => SH().hm(Math.round(m));
  // čas letu „…THH:MM“ v minutách od půlnoci (místní čas letiště), jinak null
  const clockMin = s => { const x = typeof s === 'string' && s.length >= 16 ? +s.slice(11, 13) * 60 + +s.slice(14, 16) : NaN; return Number.isFinite(x) ? x : null; };
  // místní čas „YYYY-MM-DDTHH:MM“ jako ms (bez pásma – porovnávají se časy téhož místa): den z paměti (dnů je v hledání
  // pár desítek, nabídek stovky) + hodina a minuta
  const dayMs = new Map();
  const localMs = s => {
    if (typeof s !== 'string' || s.length < 16) return null;
    const d = s.slice(0, 10);
    let x = dayMs.get(d);
    if (x === undefined) { x = Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)); dayMs.set(d, x); }
    const m = clockMin(s);
    return Number.isFinite(x) && m != null ? x + m * 60000 : null;
  };
  const dayMin = x => (((x % DAY) + DAY) % DAY) / 60000;
  // minuty na letišti před odletem podle země cíle (SearchHelp.beforeFor – mimo Schengen o půl hodiny víc), jednou na zemi
  const befMemo = new Map();
  const beforeOf = cc => { const k = cc || ''; if (!befMemo.has(k)) befMemo.set(k, SH().beforeFor(cc)); return befMemo.get(k); };
  const okGround = g => Boolean(g && !g.off && +g.minutes > 0);
  const aMin = a => (a && +a.min > 0 ? +a.min : 0);
  // cena i s cestou na letiště a do města; chybí (nebo je nesmyslně pod letenkou) → jen letenka
  const tripOf = t => (Number.isFinite(t.tripCzk) && t.tripCzk >= t.perPersonCzk ? t.tripCzk : t.perPersonCzk);

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
  const NO_LAY = Object.freeze({ min: 0, lay: null });
  function layover(l, km) {
    if (!l || !(l.stops > 0)) return NO_LAY;
    const lay = SH().maxLayover(l), dur = SH().legMinutes(l);
    const direct = Number(km) > 0 ? km / 780 * 60 + 35 : null;
    const sum = Array.isArray(l.layovers) && l.layovers.length ? l.layovers.reduce((s, x) => s + (+x.min || 0), 0) : null;
    const min = dur && direct ? Math.max(0, dur - direct) : sum != null ? sum : W.layUnknownMin * l.stops;
    return { min: Math.round(min), lay };
  }

  // veřejnou dopravou na letiště mimo tvoje město nightHome (v noci nic nejede, noc na letišti), autem a z letiště ve tvém
  // městě (taxi, noční linka) nightSoft – stejně jako varování ⏰ u nabídky (reach.warn)
  const nightCls = x => (x.mode === 'car' || x.local ? W.nightSoft : W.nightHome);
  const NIGHT_TXT = ' (v noci veřejná doprava nejede)';

  /**
   * Srovnávací cena nabídky t (Kč/os.) a její rozpis. ctx (ctxOf): ground(iata) = doprava na letiště domova
   * (origins[].ground), arrival(iata) = z letiště do města ({ min }), stats(destKey) = priceStats cíle, cc(destKey) = země,
   * level(t) = „Je to dobrá cena?“, memo = WeakMap (skóre se počítá jednou na nabídku).
   * → { czk, base (letenka + zavazadla), trip (i s cestou), parts: { ground, access, lay, night, stay, deal } v Kč,
   *     groundHome / groundCity (z ground: na letiště a zpět / z letiště do města a zpět), accessMin, homeMin, cityMin,
   *     layMin, notes: [{ txt, czk }] (noční časy), dayH / refH (hodiny přes den na místě / očekávané), pct }
   * Co nabídka nemá (doprava na letiště, cesta do města, časy, délka letu), do ceny nejde – nic se nedomýšlí.
   */
  function score(t, ctx = {}) {
    const hit = ctx.memo && ctx.memo.get(t);
    if (hit) return hit;
    const h = SH();
    const base = t.perPersonCzk, trip = tripOf(t);
    const cc = ctx.cc ? ctx.cc(t.destKey) : null;
    const gOut = ctx.ground ? ctx.ground(t.out.from) : null, gBack = t.back && ctx.ground ? ctx.ground(t.back.to) : null;
    const aOut = ctx.arrival ? ctx.arrival(t.out.to) : null, aBack = t.back && ctx.arrival ? ctx.arrival(t.back.from) : null;
    // cesta: na letiště a z letiště domů (jen když ji hledání počítá) a z letiště do města tam i zpět
    const gO = okGround(gOut) ? gOut : null, gB = okGround(gBack) ? gBack : null;
    const homeMin = (gO ? +gO.minutes : 0) + (gB ? +gB.minutes : 0), cityMin = aMin(aOut) + aMin(aBack);
    const accessMin = homeMin + cityMin;
    // přestupy
    const lo = layover(t.out, t.distanceKm), lb = layover(t.back, t.distanceKm);
    const layMin = lo.min + lb.min, longLay = Math.max(lo.lay || 0, lb.lay || 0);
    let lay = layMin / 60 * W.hourCzk;
    if (longLay >= W.layNightMin) lay += W.layNightCzk;
    // noc: z domu a domů (SearchHelp.reach jako štítky ⏰ / 🏠 u nabídky), v cíli do města a z města
    const notes = [];
    const before = beforeOf(cc);
    const r = h.reach(t, gO, gB, { before, bare: true }), RE = h.REACH;
    // min = minuty od půlnoci dne letu (z domu i záporné = večer předem, domů i přes 24 h = další den)
    if (r.out && r.out.min < RE.early) {
      // tam: z domu před 4:30 – ráno (reach.early), večer předem na ranní let ze vzdáleného letiště, nebo let v noci
      const o = r.out, dep = clockMin(t.out.dep);
      notes.push({
        txt: o.early && o.min >= 0 ? `z domu už ${h.ve(o.min)} ${h.clockTxt(o.min)}${o.warn ? NIGHT_TXT : ''}`
          : dep != null && dep < RE.early ? `odlet v noci (${h.clockTxt(dep)})` : `z domu už ${h.ve(o.min)} ${h.clockTxt(o.min)} večer předem (noc na cestě)`,
        czk: nightCls(o),
      });
    }
    const arr = r.back ? clockMin(t.back.arr) : null;
    if (r.back && (r.back.late || (arr != null && arr < RE.lateTo) || r.back.min >= 1440 + RE.lateFrom)) {
      // zpět: doma mezi 0:30 a 5:00 (reach.late), přílet po půlnoci, nebo domů až ráno další den (noc v autobuse)
      const b = r.back;
      notes.push({
        txt: b.late ? `domů až ~${h.clockTxt(b.min)}${b.warn ? NIGHT_TXT : ''}`
          : arr < RE.lateTo ? `přílet zpět v noci (${h.clockTxt(arr)}), domů ~${h.clockTxt(b.min)}` : `domů až ráno ~${h.clockTxt(b.min)} (noc na cestě)`,
        czk: nightCls(b),
      });
    }
    const oa = t.out.hasTime && t.out.arr && !t.out.arrUnknown ? localMs(t.out.arr) : null;
    const cityIn = oa != null ? oa + (RE.after + aMin(aOut)) * 60000 : null;
    const bd = t.back && t.back.hasTime ? localMs(t.back.dep) : null;
    const cityOut = bd != null ? bd - (before + aMin(aBack)) * 60000 : null;
    if (cityIn != null && (dayMin(cityIn) >= 23.5 * 60 || dayMin(cityIn) < 5 * 60)) notes.push({ txt: `v cíli do města až ~${h.clockTxt(dayMin(cityIn))}`, czk: W.nightCity });
    if (cityOut != null && dayMin(cityOut) < RE.early) notes.push({ txt: `z města na letiště už ~${h.clockTxt(dayMin(cityOut))}`, czk: W.nightCity });
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
    // z ceny cesty: na letiště a zpět (groundCzk ze serveru, i parkování) a zbytek z letiště do města a zpět – štítek
    // „levnější cesta na letiště“ jen když je levnější opravdu ta
    const groundHome = Math.max(0, Math.min(parts.ground, Number.isFinite(t.groundCzk) ? Math.round(t.groundCzk) : 0));
    const sc = {
      czk: base + parts.ground + parts.access + parts.lay + parts.night + parts.stay + parts.deal,
      base, trip, parts, groundHome, groundCity: parts.ground - groundHome, accessMin, homeMin, cityMin, layMin, longLay: longLay || null, notes, dayH, refH, pct, median: st ? st.median : null,
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
    const rest = items.map((x, i) => { const k = Number(key(x)); return { x, i, k: Number.isFinite(k) ? k : Infinity, c: ccOf(x) || '' }; })
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
    const ts = trips || [];
    for (let i = 0; i < ts.length; i++) {
      const t = ts[i];
      if (!t || !t.out) continue;
      const s = score(t, ctx);
      if (!best || s.czk < bs.czk || (s.czk === bs.czk && t.perPersonCzk < best.perPersonCzk)) { best = t; bs = s; }
    }
    return best;
  }

  const SHORT = {
    airport: 'i s cestou na letiště nejlevnější', airportLess: 'levnější i s cestou na letiště', ground: 'levnější cesta na letiště',
    groundCity: 'levnější cesta z letiště do města', access: 'kratší cesta na letiště', city: 'letiště blíž městu',
    lay: 'bez dlouhého přestupu', layNone: 'bez přestupu', layLess: 'kratší přestup', night: 'rozumné časy', nightLess: 'lepší časy',
    nightOther: 'levnější let je v noci',
    stay: 'víc času na místě', stayNight: 'víc času na místě na noc', mix: 'pestřejší výběr', sum: 'celkově výhodnější',
  };
  const nightsTxt = n => `${n} ${n === 1 ? 'noc' : n >= 2 && n <= 4 ? 'noci' : 'nocí'}`;

  /**
   * Proč je položka výš než levnější letenka. list = položky v konečném pořadí [{ t, sc, label, cc, alt?, minTrip? }]
   * (alt = jiná nabídka téhož cíle s levnější letenkou, { t, sc } – s ní by cíl stál v řazení „Nejlevnější letenka“;
   * minTrip = nejnižší cena i s cestou na letiště a do města mezi nabídkami cíle – „nejlevnější“ musí platit), n = kolik
   * prvních položek štítek může dostat. Štítek dostane jen položka, která předběhla levnější letenku (cíl níž v pořadí,
   * nebo levnější nabídku svého cíle) – vybere se nejlevnější z těch, které tahle předběhla srovnávací cenou, a složka
   * srovnávací ceny, ve které je tahle nejvíc lepší a ve které štítek platí doslova (ne „víc času na místě“, když tahle
   * má hodin míň a jen méně nocí; ne „rozumné časy“ u letu bez známých časů nebo s nočním odjezdem). Předběhla-li levnější
   * letenky jen díky pestrosti (srovnávací cenou je dražší), „pestřejší výběr“. → Map index → { k, text, title }.
   */
  function reasons(list, n = 10) {
    const out = new Map();
    const low = y => (y.alt && y.alt.t !== y.t && y.alt.t.perPersonCzk < y.t.perPersonCzk ? { ...y.alt, label: y.label, cc: y.cc } : y);
    const lows = list.map(low);
    // nejnižší cena i s cestou, kterou cíl má (zvolená nabídka, levnější letenka, kterákoli jeho nabídka)
    const floor = y => Math.min(tripOf(y.t), y.alt ? tripOf(y.alt.t) : Infinity, Number.isFinite(y.minTrip) ? y.minTrip : Infinity);
    const known = y => Boolean(y.t.out.hasTime && (!y.t.back || y.t.back.hasTime));
    const direct = y => !(y.t.out.stops > 0) && !(y.t.back && y.t.back.stops > 0);
    const perNight = s => (s.dayH != null && s.refH > 0 ? s.dayH / s.refH : null);
    const notesTxt = s => s.notes.map(z => z.txt).join(', ');
    const seen = new Map(); // země položek nad i-tou (kolikrát) – přirážka pestrosti v kroku i (Rank.order)
    for (let i = 0; i < Math.min(n, list.length); i++) {
      const x = list[i], p = x.t.perPersonCzk;
      if (i) seen.set(list[i - 1].cc || '', (seen.get(list[i - 1].cc || '') || 0) + 1);
      // r = nejlevnější letenka, kterou tahle předběhla srovnávací cenou (levnější nabídka cíle vždy – pick); rv = nejlevnější,
      // kterou předběhla jen díky pestrosti (srovnávací cenou je tahle dražší) – „pestřejší výběr“ jen bez jiného důvodu
      let r = null, rv = null;
      const consider = y => {
        if (!(y.t.perPersonCzk < p)) return;
        if (y.own || y.sc.czk >= x.sc.czk) { if (!r || y.t.perPersonCzk < r.t.perPersonCzk) r = y; } else if (!rv || y.t.perPersonCzk < rv.t.perPersonCzk) rv = y;
      };
      if (lows[i] !== x) consider({ ...lows[i], own: true });
      for (let j = i + 1; j < list.length; j++) consider(lows[j]);
      r = r || rv;
      if (!r) continue;
      // o kolik Kč srovnávací ceny je tahle v každé složce lepší než levnější letenka r – vyhraje největší rozdíl
      const d = k => (r.sc.parts[k] || 0) - (x.sc.parts[k] || 0);
      const dt = k => ((r.sc[k] || 0) - (x.sc[k] || 0)) / 60 * W.hourCzk;
      // i s cestou na letiště a do města levnější než r: cena i čas té cesty jsou jeden důvod – „levnější i s cestou“
      // („nejlevnější“ jen když je i s cestou nejlevnější z celého seznamu, i proti položkám nad sebou); jinak zvlášť
      // „levnější cesta na letiště“ / „… z letiště do města“, „kratší cesta na letiště“, „letiště blíž městu“
      const cheaperTrip = tripOf(x.t) < tripOf(r.t);
      const cand = (cheaperTrip ? [['ground', d('ground') + dt('homeMin') + dt('cityMin')]] : [['ground', d('ground')], ['access', dt('homeMin')], ['city', dt('cityMin')]])
        .concat([['lay', d('lay')], ['night', d('night')], ['stay', d('stay')], ['deal', d('deal')]])
        .sort((a, b) => b[1] - a[1]);
      // štítek ke složce c, jen když platí doslova (jinak null – zkusí se další složka)
      const claim = c => {
        if (c === 'ground') {
          if (cheaperTrip) return list.every(y => floor(y) >= tripOf(x.t)) ? 'airport' : 'airportLess';
          const dh = r.sc.groundHome - x.sc.groundHome, dc = r.sc.groundCity - x.sc.groundCity;
          return dh >= dc ? (dh > 0 ? 'ground' : null) : 'groundCity';
        }
        // let bez známých časů (cena z mezipaměti) nemá noční přirážku jen proto, že časy neznáme – štítek říká to o tamté
        if (c === 'night') return known(x) ? (x.sc.notes.length ? 'nightLess' : 'night') : 'nightOther';
        // přirážka za pobyt roste s cenou cesty – stejný podíl dne u dražší cesty „víc času“ není
        if (c === 'stay') return x.sc.dayH == null || r.sc.dayH == null ? null : x.sc.dayH > r.sc.dayH ? 'stay' : perNight(x.sc) > perNight(r.sc) ? 'stayNight' : null;
        if (c === 'lay') {
          if (direct(x)) return 'layNone';
          if (x.sc.longLay != null && x.sc.longLay < W.layNightMin && r.sc.longLay >= W.layNightMin) return 'lay';
          return x.sc.layMin < r.sc.layMin ? 'layLess' : null;
        }
        return c;
      };
      // pestrost: země tamté je nad touhle víckrát než země téhle (Rank.order ji v kroku i porovnal s vyšší přirážkou)
      const cnt = c => Math.min(W.sameMax, (c && seen.get(c)) || 0);
      const mixed = !r.own && cnt(r.cc) > cnt(x.cc);
      let k = null;
      if (mixed && x.sc.czk > r.sc.czk) k = 'mix'; // srovnávací cenou dražší – výš jen díky pestrosti
      else for (const [c, v] of cand) { if (!(v > 0)) break; k = claim(c); if (k) break; }
      if (!k) k = mixed ? 'mix' : 'sum';
      const route = y => `${y.t.out.from} → ${y.t.out.to}${y.t.back && y.t.back.to !== y.t.out.from ? ` ↩ ${y.t.back.to}` : ''}, ${SH().dm(y.t.out.date)}${y.t.back ? `–${SH().dm(y.t.back.date)}` : ''}`;
      const who = r.own ? `Varianta ${route(r)}` : `${r.label} (${route(r)})`;
      const ta = r.own ? 'ta' : 'tamta', tej = r.own ? 'té' : 'tamté';
      const nights = s => nightsTxt(Math.round(s.refH / W.stayHours));
      const long = {
        airport: `i s cestou na letiště a do města tahle vyjde na ~${kc(tripOf(x.t))}, ${ta} na ~${kc(tripOf(r.t))}`,
        airportLess: `i s cestou na letiště a do města tahle vyjde na ~${kc(tripOf(x.t))}, ${ta} na ~${kc(tripOf(r.t))}`,
        ground: `cesta na letiště a zpět tu stojí ~${kc(x.sc.groundHome)}, tam ~${kc(r.sc.groundHome)}`,
        groundCity: `cesta z letiště do města a zpět tu stojí ~${kc(x.sc.groundCity)}, tam ~${kc(r.sc.groundCity)}`,
        access: `cesta z domova na letiště a zpět trvá ~${hm(x.sc.homeMin)} proti ~${hm(r.sc.homeMin)}`,
        city: `z letiště do města a zpět je to ~${hm(x.sc.cityMin)} proti ~${hm(r.sc.cityMin)}`,
        lay: `${ta} má přestup ${hm(r.sc.longLay || 0)}, tahle nejvýš ${hm(x.sc.longLay || 0)}`,
        layNone: `${ta} má přestup${r.sc.longLay ? ` ${hm(r.sc.longLay)}` : ''}, tahle letí přímo`,
        layLess: `přestupy tu přidají ~${hm(x.sc.layMin)}, tam ~${hm(r.sc.layMin)}`,
        night: `${ta}: ${notesTxt(r.sc) || 'nevhodné časy'}`,
        nightLess: `${ta}: ${notesTxt(r.sc) || 'nevhodné časy'}; tahle: ${notesTxt(x.sc)}`,
        nightOther: `${ta}: ${notesTxt(r.sc) || 'nevhodné časy'}; časy téhle letenky neznám`,
        stay: `z ${tej} zbude na místě ~${Math.round(r.sc.dayH || 0)} h přes den, z téhle ~${Math.round(x.sc.dayH || 0)} h`,
        stayNight: `z ${tej} zbude na místě ~${Math.round(r.sc.dayH || 0)} h přes den za ${nights(r.sc)}, z téhle ~${Math.round(x.sc.dayH || 0)} h za ${nights(x.sc)}`,
        deal: `tahle je o ${x.sc.pct} % pod obvyklou cenou do cíle (polovina nabídek nejvýš ${kc(x.sc.median || 0)})`,
        mix: 'ze stejné země je výš už jiný cíl – pořadí střídá země',
        sum: `po započtení cesty, časů a pobytu vyjde tahle na ~${kc(x.sc.czk)}, ${ta} na ~${kc(r.sc.czk)}`,
      }[k];
      const text = k === 'deal' ? `o ${x.sc.pct} % pod obvyklou cenou` : SHORT[k];
      // lead = věta, kterou vidí telefon na kartě; rozpis srovnávací ceny jen v title (na telefonu by to byla zeď textu)
      const lead = `${who} má levnější letenku (${kc(r.t.perPersonCzk)}), ale ${long}.`;
      out.set(i, { k, text, lead, title: `${lead} Doporučené pořadí: ${explain(x.sc)}.` });
    }
    return out;
  }

  /**
   * Kontext skóre z výsledku hledání: doprava na letiště z origins, cesta do města z arrivals, statistika cen a země cíle
   * ze skupin (u konkrétního cíle statistika celé trasy). opts.level = úroveň ceny nabídky (výchozí t.priceLevel).
   */
  function ctxOf(res, opts = {}) {
    const ground = new Map(((res && res.origins) || []).filter(o => o && o.iata).map(o => [o.iata, o.ground || null]));
    // Map místo objektu se stovkou letišť – hledání v něm je u prvního výpočtu po načtení stránky znatelně rychlejší
    const arr = new Map(Object.entries((res && res.arrivals) || {}));
    const groups = ((res && res.groups) || []).filter(g => g && g.dest);
    const stats = new Map(groups.map(g => [g.dest.key, g.priceStats || null]));
    const cc = new Map(groups.map(g => [g.dest.key, g.dest.cc || null]));
    // statistika celého hledání jen u výsledku s jedním cílem – u „kamkoliv“ by cíl bez vlastní statistiky dostal slevu
    // za cenu pod mediánem letenek do všech cílů (jako PriceCheck.statsOf)
    const route = (groups.length <= 1 && res && res.priceStats) || null;
    // jak hluboko pod mediánem cíle bývá jeho nejlevnější letenka (medián přes cíle s aspoň dealN nabídkami)
    const qs = groups.filter(g => g.priceStats && g.priceStats.n >= W.dealN && g.priceStats.median > 0 && g.minFlightCzk > 0)
      .map(g => g.minFlightCzk / g.priceStats.median).sort((a, b) => a - b);
    const dealBase = qs.length >= W.dealN ? qs[Math.floor((qs.length - 1) / 2)] : null;
    return {
      dealBase,
      ground: iata => ground.get(iata) || null,
      arrival: iata => arr.get(iata) || null,
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
