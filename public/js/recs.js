/* ATLAS – Doporučení „Kam vyrazit“ (sekce Doporučení a tipy na Přehledu): pořadí zemí pro měsíc a proč. Čistá logika
   bez DOM (test/recs.test.js). Pevné body, nic se neučí – každé místo v pořadí jde vysvětlit jednou větou.

     sezóna      měsíc mezi nejlepšími měsíci země 3 b., měsíc vedle 1,5 b.; mimo sezónu celkové skóre × 0,55
     blízko      z Prahy do 4 000 km (let do ~5 h: Rudé moře, Kanáry) 1,5 b., do 6 000 km 0,75 b. (kratší a levnější
                 let – u Gambie nebo Laosu levné ubytování nezaplatí letenku); k moři vzdálenost oblasti u moře
     časté cíle  země, kam se z Česka jezdí nejčastěji (POPULAR – bývá kam letět přímo nebo s jedním přestupem) 1 b.
     cena        cenová hladina země (1–5 tečky) až 2 b.; bezpečnost až 1,5 b. (+0,3 za „bezpečné“)
     styl        zvolený styl cesty 3 b.; „🏖️ k moři“ jen tam, kde je v měsíci počasí k moři (níž), a čím tepleji
                 (22 → 28 °C přes den), tím výš – až 1 b. (Rudé moře v listopadu před Madeirou na hraně koupání)
     ty          hledáš hlavně moře (aspoň 2 z posledních 5 hledání k moři nebo za teplem) a styl nevolíš: moře 1,5 b.;
                 ⭐ Moje cíle v zemi 1 b.; 👀 nedávno prohlížený cíl 0,4 b.; radar zná letenku do země 0,5 b.;
                 s dětmi (děti v hledání) blízko + 1 b. a bezpečné (4–5) + 0,5 b.
     pestrost    každá další země ze stejného světadílu o 5 % níž (nejvýš 3×) – nahoře ne šest afrických zemí; víc
                 by v červenci k moři vytlačilo Řecko a Španělsko za Samou a Gabon
   Vynechá: Česko, země, kam MZV ČR nedoporučuje cestovat (bezpečnost 1–2), a země s městem v 🙈 Nezajímá mě (bez ⭐
   v téže zemi) – vynechané vypíše pod výsledky, ať je vidět proč. Skóre na kartě je i s pestrostí (pořadí = skóre).

   Počasí k moři (data z api/climate?month=, dlouhodobý průměr u letiště – ne předpověď, teplotu moře ATLAS nezná):
   oblast u moře (Kanáry, Rudé moře…), jinak hlavní letiště; přes den aspoň 22 °C a v průměru s minulým měsícem aspoň
   22 °C (moře se ohřívá pomaleji – Jadran v květnu ne), srážky nejvýš 250 mm; mimo nejlepší měsíce země jen suchá
   oblast (do 100 mm). Kdo chce k moři, tomu je takový měsíc sezónou (3 b.), když tam přes den není přes 33 °C –
   Kanáry v prosinci i Řecko v červenci, přestože nejlepší měsíce obou zemí jsou jaro a podzim (památky, ne pláž);
   Rudé moře v červenci (41 °C) ne. Bez dat (offline) „k moři“ jen v sezóně. */
(function () {
  'use strict';
  const W = {
    season: 3, seasonNear: 1.5, offSeason: 0.55,
    near: 1.5, nearKm: 4000, midKm: 6000, mid: 0.75, popular: 1,
    value: 2, safety: 1.5, safe4: 0.3,
    vibe: 3, seaHint: 1.5, fav: 1, viewed: 0.4, flight: 0.5, kidsNear: 1, kidsSafe: 0.5,
    seaHi: 22, seaHot: 33, seaRain: 250, seaDry: 100, seaWarm: 1, seaWarmTo: 28,
    sameCont: 0.05, sameMax: 3,
    viewedDays: 21, radarDays: 7,
  };
  // regiony u moře (id rg:… z našeptávače, Smart „k moři“) – hledání tam = hledání k moři
  const SEA_RG = new Set(['kanary', 'baleary', 'mallorca', 'kreta', 'sicilie', 'sardinie', 'madeira', 'azory', 'kypr', 'rhodos',
    'korfu', 'zakynthos', 'santorini', 'kos', 'korsika', 'chorvatske-pobrezi', 'dalmacie', 'istrie', 'algarve', 'costa-del-sol',
    'apulie', 'kalabrie', 'amalfi', 'azurove-pobrezi', 'bulharske-pobrezi', 'bali', 'zanzibar', 'maledivy', 'mauricius',
    'seychely', 'phuket', 'egypt-more', 'turecka-riviera']);
  // nejčastější cíle cest z Česka (léto u moře, města, zimní exotika) – v pořadí výš než stejně levné, ale vzdálené
  // a hůř dostupné země (Gambie, Laos, Kiribati); nic dalšího se z toho nevyvozuje
  const POPULAR = new Set(['HR', 'IT', 'ES', 'GR', 'EG', 'TR', 'AT', 'DE', 'FR', 'PT', 'GB', 'NL', 'PL', 'SK', 'HU', 'SI', 'ME', 'AL',
    'BG', 'CY', 'MT', 'TN', 'MA', 'AE', 'TH', 'VN', 'LK', 'MV', 'US', 'CA', 'MX', 'DO', 'CU', 'IS', 'NO', 'SE', 'DK', 'FI', 'GE', 'JO',
    'JP', 'ID']);
  const MON_LOC = ['v lednu', 'v únoru', 'v březnu', 'v dubnu', 'v květnu', 'v červnu', 'v červenci', 'v srpnu', 'v září', 'v říjnu', 'v listopadu', 'v prosinci'];
  const VIBE_TAG = { 'pláže': 'pláže a moře', hory: 'hory', historie: 'historie', safari: 'příroda', 'město': 'města' };
  const NB = '\u00a0'; // pevná mezera – „25 °C“ a „1 900 Kč“ se na telefonu nerozdělí
  const kc = n => Math.round(n).toLocaleString('cs-CZ').replace(/\s/g, NB) + NB + 'Kč';
  const km = n => `${(Math.round(n / 100) * 100).toLocaleString('cs-CZ').replace(/\s/g, NB)}${NB}km`;
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const dm = d => `${+d.slice(8, 10)}.${NB}${+d.slice(5, 7)}.`;
  const ccOk = cc => /^[A-Z]{2}$/.test(cc || '');
  // „Rudé moře (Egypt)“ → „Rudé moře“, „Kapverdy (Sal)“ → „Kapverdy“: na kartě je místo ve dvou řádcích, země je nad tím
  const short = s => String(s || '').replace(/\s*\([^)]*\)$/, '');
  const destKeyOf = id => { const m = /^(?:metro|ap):([A-Z0-9]{3})$/.exec(String(id || '')); return m ? m[1] : null; };

  /** Měsíc, na který tipovat: od 20. dne už příští – cesta se plánuje aspoň pár týdnů dopředu (23. 10. → listopad). */
  function defaultMonth(d = new Date()) {
    const m = d.getMonth() + 1;
    return d.getDate() >= 20 ? m % 12 + 1 : m;
  }
  /**
   * Termín hledání letů pro měsíc m (1–12) od dneška today ('YYYY-MM-DD'): nejbližší takový měsíc, začátek nejdřív
   * zítra → { dFrom, dTo } | null (z měsíce zbývá míň než 3 dny – pak až za rok by bylo moc daleko).
   */
  function monthRange(m, today) {
    const y0 = +today.slice(0, 4), m0 = +today.slice(5, 7);
    const y = m >= m0 ? y0 : y0 + 1;
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const pad = n => String(n).padStart(2, '0');
    const dTo = `${y}-${pad(m)}-${pad(last)}`;
    const tomorrow = new Date(Date.parse(today + 'T12:00:00Z') + 864e5).toISOString().slice(0, 10);
    const first = `${y}-${pad(m)}-01`;
    const dFrom = first > tomorrow ? first : tomorrow;
    return (Date.parse(dTo) - Date.parse(dFrom)) / 864e5 >= 2 ? { dFrom, dTo } : null;
  }

  /**
   * Co víme o uživateli (všechno jen z tohoto prohlížeče): recent = S.recent ([{ form }]), form = S.form, fav / mute =
   * S.fav / S.mute ([{ key, label, cc }]), viewed = S.viewed ([{ label, cc, at }]).
   * → { sea (hledá hlavně moře), seaN, kids, fav / mute / viewed: Map cc → [názvy] }
   */
  function profile({ recent, form, fav, mute, viewed, now = Date.now() } = {}) {
    const forms = (Array.isArray(recent) ? recent : []).map(e => e && e.form).filter(f => f && f.trip !== 'multi').slice(0, 5);
    const seaOf = f => (Array.isArray(f.to) ? f.to : []).some(t => t && /^rg:/.test(t.id) && SEA_RG.has(t.id.slice(3))) || +f.minTemp >= 20;
    const seaN = forms.filter(seaOf).length;
    const kidsOf = f => f && (+f.children > 0 || +f.infants > 0);
    const byCc = (l, keep = () => true) => {
      const m = new Map();
      for (const x of Array.isArray(l) ? l : []) {
        if (!x || !ccOk(x.cc) || !keep(x)) continue;
        if (!m.has(x.cc)) m.set(x.cc, []);
        if (x.label && !m.get(x.cc).includes(x.label)) m.get(x.cc).push(String(x.label));
      }
      return m;
    };
    return {
      sea: seaN >= 2, seaN,
      kids: [form, ...forms.slice(0, 3)].some(kidsOf),
      fav: byCc(fav), mute: byCc(mute),
      viewed: byCc(viewed, x => now - (x.at || 0) <= W.viewedDays * 864e5),
    };
  }

  /**
   * Nejlevnější letenka radaru do každé země: S.radar ({ all, weekend, lw: { start: výsledek } }; výsledek { at, items:
   * [{ id, cc, czk, from, d1 }] }) – jen výsledky do 7 dní, odlet od dneška, bez 🙈 cílů → Map cc → { czk, from, d1 }.
   */
  function radarBest(radar, now, today, mute) {
    const out = new Map(), skip = new Set((Array.isArray(mute) ? mute : []).map(x => x && x.key).filter(Boolean));
    const entries = radar ? [radar.all, radar.weekend, ...Object.values(radar.lw || {})] : [];
    for (const e of entries) {
      if (!e || !Array.isArray(e.items) || !(now - (e.at || 0) <= W.radarDays * 864e5)) continue;
      for (const x of e.items) {
        if (!x || !ccOk(x.cc) || !(x.czk > 0) || !(String(x.d1 || '') >= today) || skip.has(destKeyOf(x.id))) continue;
        const cur = out.get(x.cc);
        if (!cur || x.czk < cur.czk) out.set(x.cc, { czk: x.czk, from: String(x.from || ''), d1: x.d1 });
      }
    }
    return out;
  }

  /**
   * Počasí k moři v zemi (sezónní data země z api/climate?month=, season = 1 / 0,5 / 0 podle nejlepších měsíců)
   * → { ok, place (oblast u moře, jinak město hlavního letiště), hi } | null (bez dat).
   */
  function seaWeather(clim, season) {
    if (!clim) return null;
    const p = clim.sea || (Number.isFinite(clim.hi) ? clim : null);
    if (!p || !Number.isFinite(p.hi)) return null;
    const warm = p.hi >= W.seaHi && (p.hi + (Number.isFinite(p.hiPrev) ? p.hiPrev : p.hi)) / 2 >= W.seaHi;
    const wet = Number.isFinite(p.p) ? p.p : 0;
    const ok = warm && wet <= W.seaRain && (season > 0 || wet <= W.seaDry);
    return { ok, place: short(clim.sea ? clim.sea.name : clim.city), hi: p.hi };
  }

  /**
   * Pořadí zemí pro měsíc m (1–12). countries = data/countries.json, opt:
   *   vibe ('' | 'pláže' | 'hory' …), vibes (VIBES z data.js), budget (nejvýš tolik teček), safe (aspoň taková bezpečnost),
   *   season (api/climate?month= → countries | null), prof (profile()), radar (radarBest()), skip (Set iso – Přehled
   *   bez navštívených), n (kolik)
   * → { list: [{ c, score, season, vibe, sea, tags, why: [{ ic, t, title }], fly: { id, label } }],
   *     hidden: { mute: [názvy zemí], unsafe: počet } }
   */
  function rank(countries, m, opt = {}) {
    const { vibe = '', vibes = {}, budget = 9, safe = 0, season = null, prof = profile(), radar = new Map(), skip = null, n = 18 } = opt;
    const hidden = { mute: [], unsafe: 0 };
    const seaWanted = vibe === 'pláže' || (!vibe && prof.sea);
    const kws = vibe ? (vibes[vibe] || []).map(norm) : [];
    const seaKws = (vibes['pláže'] || []).map(norm);
    const haveKm = Boolean(season && Object.values(season).some(x => x && Number.isFinite(x.km) && x.km > 0));
    // 100 = vše, co země může dostat bez ⭐, radaru a dětí (ty přidají navíc, skóre končí na 99)
    const max = W.season + W.popular + W.value + W.safety + W.safe4 + (haveKm ? W.near : 0) + (vibe ? W.vibe : prof.sea ? W.seaHint : 0)
      + (seaWanted && season ? W.seaWarm : 0);
    const scored = [];
    for (const c of countries || []) {
      if (!c || !c.cost || c.iso2 === 'CZ' || (skip && skip.has(c.iso2))) continue;
      if (c.cost > budget || c.safety < safe) continue;
      if (c.safety <= 2) { hidden.unsafe++; continue; }
      if (prof.mute.has(c.iso2) && !prof.fav.has(c.iso2)) { hidden.mute.push(c.cs); continue; }
      const ms = Array.isArray(c.months) ? c.months : [];
      let s = ms.includes(m) ? 1 : ms.includes(m % 12 + 1) || ms.includes((m + 10) % 12 + 1) ? 0.5 : 0;
      const hay = norm(`${c.blurb || ''} ${(c.tags || []).join(' ')}`);
      const clim = season ? season[c.iso2] || null : null;
      const sw = seaWeather(clim, s);
      // k moři: klíčové slovo v popisu země a počasí k moři (bez dat aspoň měsíc vedle nejlepších)
      const seaKw = seaKws.some(k => hay.includes(k));
      const seaOk = seaKw && (sw ? sw.ok : s > 0);
      // k moři je sezóna tam, kde je počasí k moři (Kanáry v prosinci) – ale ne do vedra (Rudé moře v červenci)
      if (seaWanted && seaOk && sw && sw.hi <= W.seaHot) s = 1;
      const vm = vibe === 'pláže' ? seaOk : vibe ? kws.some(k => hay.includes(k)) : false;
      // k moři se letí do oblasti u moře (Kanáry 3 300 km, ne Madrid 1 750 km) – vzdálenost i počasí odtud
      const useSea = Boolean(seaWanted && seaOk && sw && clim.sea);
      const km0 = useSea ? clim.sea.km : clim && clim.km;
      const dist = Number.isFinite(km0) && km0 > 0 ? km0 : null;
      const near = dist == null ? 0 : dist <= W.nearKm ? W.near : dist <= W.midKm ? W.mid : 0;
      const warmth = seaWanted && seaOk && sw ? Math.max(0, Math.min(1, (sw.hi - W.seaHi) / (W.seaWarmTo - W.seaHi))) * W.seaWarm : 0;
      const fav = prof.fav.get(c.iso2), seen = prof.viewed.get(c.iso2), fl = radar.get(c.iso2);
      let total = (s === 1 ? W.season : s ? W.seasonNear : 0) + near + (POPULAR.has(c.iso2) ? W.popular : 0) + (6 - c.cost) / 5 * W.value + c.safety / 5 * W.safety
        + (c.safety >= 4 ? W.safe4 : 0) + (vm ? W.vibe : 0) + (!vibe && prof.sea && seaOk ? W.seaHint : 0) + warmth
        + (fav ? W.fav : 0) + (seen && !fav ? W.viewed : 0) + (fl ? W.flight : 0)
        + (prof.kids ? (near === W.near ? W.kidsNear : 0) + (c.safety >= 4 ? W.kidsSafe : 0) : 0);
      if (!s) total *= W.offSeason;
      const tags = [];
      if (vm) tags.push(VIBE_TAG[vibe] || vibe); else if (!vibe && prof.sea && seaOk) tags.push('moře');
      if (s === 1) tags.push('ideální počasí');
      if (near === W.near) tags.push('blízko');
      if (c.cost <= 2) tags.push('levné');
      if (c.safety >= 5) tags.push('velmi bezpečné'); else if (c.safety >= 4) tags.push('bezpečné');
      // proč (věty pod kartou): počasí v měsíci, letenka z radaru, ⭐ / 👀, s dětmi
      const why = [];
      if (useSea) why.push({ ic: '🏖️', t: `${sw.place}: ~${sw.hi}${NB}°C přes den`, title: `${sw.place} ${MON_LOC[m - 1]}: průměrné denní maximum u letiště ${clim.sea.iata} (dlouhodobý průměr, ne předpověď; teplotu moře ATLAS nezná)` });
      else if (clim && Number.isFinite(clim.hi)) why.push({ ic: seaWanted && seaOk ? '🏖️' : '🌡️', t: `${short(clim.city)}: ~${clim.hi}${NB}°C přes den`, title: `${clim.city} ${MON_LOC[m - 1]}: průměrné denní maximum u letiště ${clim.iata} (dlouhodobý průměr, ne předpověď)` });
      if (fl) why.push({ ic: '✈️', t: `tam i zpět od ${kc(fl.czk)}`, title: `Radar na Přehledu: nejlevnější zpáteční letenka do země z ${fl.from || 'okolí domova'}, odlet ${dm(fl.d1)} (cena na osobu bez dopravy na letiště)` });
      if (fav) why.push({ ic: '⭐', t: `Moje cíle: ${fav.slice(0, 2).join(', ')}`, title: 'Máš tu cíl v ⭐ Moje cíle' });
      else if (seen) why.push({ ic: '👀', t: `zaujalo tě: ${seen.slice(0, 2).join(', ')}`, title: 'Nedávno sis tenhle cíl rozbalil ve výsledcích hledání' });
      if (prof.kids && near === W.near) why.push({ ic: '👨‍👩‍👧', t: `s dětmi blízko: ~${km(dist)}`, title: 'Hledáš s dětmi – blízké a bezpečné země výš (vzdušnou čarou z Prahy)' });
      const fly = useSea && clim.sea.rg ? { id: `rg:${clim.sea.rg}`, label: clim.sea.name } : { id: `cc:${c.iso2}`, label: c.cs };
      scored.push({ c, raw: total, season: s, vibe: vm ? vibe : '', sea: seaOk, tags, why, fly });
    }
    // pestrost: vybírat postupně, každá další země ze stejného světadílu o 5 % níž (nejvýš 3×); skóre na kartě i s tím
    const list = [], per = {};
    const pool = scored.sort((a, b) => b.raw - a.raw || a.c.cs.localeCompare(b.c.cs, 'cs'));
    while (list.length < n && pool.length) {
      let bi = 0, bv = -Infinity;
      for (let i = 0; i < pool.length; i++) {
        const v = pool[i].raw * (1 - W.sameCont * Math.min(W.sameMax, per[pool[i].c.cont] || 0));
        if (v > bv) { bv = v; bi = i; }
      }
      const [x] = pool.splice(bi, 1);
      per[x.c.cont] = (per[x.c.cont] || 0) + 1;
      const { raw, ...rest } = x;
      list.push({ ...rest, score: Math.min(99, Math.round(bv / max * 100)) });
    }
    return { list, hidden };
  }

  /** Věta pod nadpisem: co z tebe Doporučení vzalo v úvahu a co vynechalo (prázdné = nic). */
  function profileLine(prof, hidden, vibe) {
    const parts = [];
    if (!vibe && prof.sea) parts.push('🏖️ hledáš hlavně moře – je výš');
    if (prof.kids) parts.push('👨‍👩‍👧 s dětmi – blízké a bezpečné výš');
    if (prof.fav.size) parts.push('⭐ země s mými cíli výš');
    if (hidden.mute.length) parts.push(`🙈 vynechávám ${hidden.mute.slice(0, 3).join(', ')}${hidden.mute.length > 3 ? ` a další ${hidden.mute.length - 3}` : ''} (máš tam město v Nezajímá mě)`);
    return parts.join(' · ');
  }

  window.Recs = { W, SEA_RG, POPULAR, defaultMonth, monthRange, profile, radarBest, seaWeather, rank, profileLine };
})();
