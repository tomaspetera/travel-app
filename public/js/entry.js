/* ATLAS – vstupní podmínky pro občany ČR (data/entry.json; zdroj MZV ČR, stav 10/2026).
   Čip u země a u letu, sekce v detailu země, varování u přestupu (tranzit), seznam „🛂 Před cestou“
   a připomínka do kalendáře. Texty z dat vždy přes esc(), odkazy přes safeUrl() (obojí z app.js). */
(function () {
  let DATA = null;
  let BY = {};
  let loading = null;
  let rate = null; // Kč za 1 EUR (z /api/health)
  const waiting = [];
  const NEED = ['eta', 'evisa', 'voa', 'visa'];
  const ARRANGE = ['eta', 'evisa', 'visa']; // vyřídit předem → připomínka v kalendáři
  // Kolik dní před odletem připomenout (víc, když data uvádějí delší vyřízení).
  const LEAD = { eta: 14, evisa: 14, visa: 30 };
  // Krátké názvy do čipů a připomínek a země v 6. pádě pro „přestup v …“.
  const SHORT_CS = { US: 'USA', GB: 'Velká Británie', AE: 'SAE', CD: 'DR Kongo' };
  const IN_CS = { US: 'v USA', CA: 'v Kanadě', GB: 've Velké Británii' };
  // Území USA s imigračními pravidly USA (ESTA) – v databázi letišť mají vlastní kód, v datech zemí nejsou.
  const ALIAS = { PR: 'US', VI: 'US', GU: 'US', MP: 'US' };
  const TERR_CS = { PR: 'Portoriko (USA)', VI: 'Americké Panenské ostrovy (USA)', GU: 'Guam (USA)', MP: 'Severní Mariany (USA)' };
  const canon = iso => (Object.hasOwn(ALIAS, iso) ? ALIAS[iso] : iso);

  const isYmd = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z'));
  const ymdOf = d => d.toISOString().slice(0, 10);
  const addDays = (ymd, n) => ymdOf(new Date(Date.parse(ymd + 'T00:00:00Z') + n * 864e5));
  /** + n měsíců; den za koncem měsíce → poslední den (31. 8. + 6 měsíců = 28./29. 2.). */
  function addMonths(ymd, n) {
    const [y, m, d] = ymd.split('-').map(Number);
    const first = new Date(Date.UTC(y, m - 1 + n, 1));
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    first.setUTCDate(Math.min(d, last));
    return ymdOf(first);
  }
  const dmy = ymd => { const [y, m, d] = ymd.split('-').map(Number); return `${d}. ${m}. ${y}`; };
  const name = iso => (Object.hasOwn(TERR_CS, iso) ? TERR_CS[iso] : null) || (typeof byIso !== 'undefined' && byIso[iso] ? byIso[iso].cs : iso);
  const shortName = iso => SHORT_CS[iso] || name(iso);
  // pevné mezery: „≈ 890 Kč“ se nezalomí
  const kc = n => (Math.round(n / 10) * 10).toLocaleString('cs-CZ') + '\u00a0Kč';

  /* ---------- data ---------- */
  function set(data) {
    DATA = data && Array.isArray(data.countries) ? data : null;
    BY = {};
    for (const r of (DATA && DATA.countries) || []) BY[r.iso2] = r;
    if (DATA) waiting.splice(0).forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
  }
  function load() {
    if (!loading) {
      loading = fetch('data/entry.json').then(r => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))).then(set)
        .catch(e => { loading = null; throw e; });
    }
    return loading;
  }
  const ready = () => Boolean(DATA);
  /** fn hned, nebo až se data načtou (jednou). */
  function whenReady(fn) { if (DATA) fn(); else waiting.push(fn); }
  // jen vlastní klíče – kód ze sdíleného odkazu nesmí sáhnout na Object.prototype
  const get = iso => { const k = String(iso || '').toUpperCase(); return (Object.hasOwn(BY, k) && BY[k]) || (Object.hasOwn(ALIAS, k) && BY[ALIAS[k]]) || null; };
  const meta = () => (DATA ? { checked: DATA.checked, source: DATA.source, sourceUrl: DATA.sourceUrl, note: DATA.note } : null);
  // „2026-10“ → „10/2026“
  const checkedTxt = () => { const m = /^(\d{4})-(\d{2})$/.exec((DATA && DATA.checked) || ''); return m ? `${+m[2]}/${m[1]}` : ''; };

  /* ---------- kurz ---------- */
  function setRate(x) { if (Number(x) > 0) rate = Number(x); }
  function eurCzk() {
    if (rate) return rate;
    // kurzy z detailu země (open.er-api.com, základ CZK)
    try { const r = S.fx.rates.EUR; if (r > 0) return 1 / r; } catch (e) { /* bez kurzů */ }
    return 24.6;
  }
  const priceTxt = eur => (eur == null ? '' : eur === 0 ? 'zdarma' : `~${eur}\u00a0€ (≈\u00a0${kc(eur * eurCzk())})`);

  /* ---------- režim ---------- */
  /** „eTA (Canada)“ → „eTA“, „NZeTA (+ IVL)“ → „NZeTA“; dlouhý název → obecné slovo. */
  function regName(r) {
    const n = String((r && r.etaName) || '').replace(/\s*\(.*?\)/g, '').split(/\s+[+–-]\s+/)[0].trim();
    return n && n.length <= 12 ? n : r && r.visa === 'eta' ? 'registrace' : 'e-vízum';
  }
  /** Režim pro čip a texty: { key, icon, label, cls, need, text }. */
  function kind(r) {
    if (!r) return null;
    // název za dvojtečkou – vlastní závorky názvu („eTA (Canada)“) se tak nevnořují
    const via = r.etaName ? `: ${r.etaName}` : '';
    switch (r.visa) {
      case 'eu': return { key: 'op', icon: '🪪', label: 'stačí OP', cls: 'ok', need: false, text: 'EU / Schengen – volný pohyb, stačí občanský průkaz' };
      case 'none': return r.idCard
        ? { key: 'op', icon: '🪪', label: 'stačí OP', cls: 'ok', need: false, text: 'Bez víza – stačí i občanský průkaz' }
        : { key: 'free', icon: '', label: 'bez víza', cls: 'free', need: false, text: 'Bez víza – jen s cestovním pasem' };
      // „bez víza“ tu neříkat: australský eVisitor je podle MZV vízum (jen online a zdarma)
      case 'eta': return { key: 'eta', icon: '🛂', label: regName(r), cls: 'reg', need: true, text: `Nutná online registrace předem${via}` };
      case 'evisa': return { key: 'evisa', icon: '🛂', label: 'e-vízum', cls: 'visa', need: true, text: `Nutné e-vízum, vyřídíš online předem${via}` };
      case 'voa': return { key: 'voa', icon: '🛂', label: 'vízum na hranici', cls: 'visa', need: true, text: `Vízum při příletu na hranici${r.etaName ? `, nebo předem online${via}` : ''}` };
      case 'visa': return { key: 'visa', icon: '📄', label: 'vízum předem', cls: 'hard', need: true, text: `Vízum předem na zastupitelském úřadě${r.etaName ? `; online žádost${via}` : ''}` };
      default: return null;
    }
  }
  // EU, EHP a Švýcarsko: volný pohyb osob – ne „bez omezení (EU)“, Švýcarsko ani Norsko v EU nejsou
  const stayTxt = r => (r.visa === 'eu' ? 'volný pohyb osob' : r.maxStayDays ? `${r.maxStayDays} dní` : r.visa === 'visa' ? 'podle víza' : 'neuvedeno');
  // neověřený záznam nesmí znít jako „ověřeno 10/2026“
  const srcTxt = r => `Zdroj: ${/(^|\.)mzv\.gov\.cz$/.test(hostOf(r.source)) ? 'MZV ČR' : hostOf(r.source)} (${r.verified ? `ověřeno ${checkedTxt()}` : `stav ${checkedTxt()}, neověřeno na oficiální stránce`})`;
  const UNVERIFIED = 'Tento záznam se nepodařilo ověřit na oficiální stránce – ber ho jen orientačně a před cestou si ho ověř na webu MZV ČR.';
  // „?“ za štítkem u neověřeného záznamu
  const q = r => (r.verified ? '' : '?');
  // časově omezený režim (validUntil, např. výjimka z K-ETA do 31. 12. 2026): cesta po tomto datu → ověřit
  const expired = (r, date) => Boolean(r && r.validUntil && isYmd(date) && date > r.validUntil);
  const untilTxt = r => `Tento režim platí podle MZV zatím do ${dmy(r.validUntil)} – pro pozdější cestu ověř, co platí potom.`;
  function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }
  /** Bublina u čipu: režim, pobyt, cena, poznámky a zdroj (prostý text – do title přes esc). */
  function tip(iso, r, k) {
    const cost = NEED.includes(r.visa) && r.etaCostEur != null ? ` – ${priceTxt(r.etaCostEur)}` : '';
    return `${name(iso)}: ${k.text}${cost}. Pobyt: ${stayTxt(r)}. ${r.notes || ''} ${srcTxt(r)}, před cestou ověř.`.replace(/\s+/g, ' ').trim();
  }

  /* ---------- čipy ---------- */
  /** Malý čip na kartu země (Česko bez čipu). */
  function cardChip(iso) {
    const r = get(iso), k = kind(r);
    if (!k || r.iso2 === 'CZ') return '';
    return `<span class="ec ec-${k.cls}" title="${esc(tip(iso, r, k))}">${k.icon ? k.icon + ' ' : ''}${esc(k.label + q(r))}</span>`;
  }
  /**
   * Čip k letu – jen když je co vyřizovat (registrace, e-vízum, vízum na hranici, vízum), nebo když cesta (date)
   * vychází po konci časově omezeného bezvízového režimu („⏳ ověř vstup“).
   */
  function flightChip(iso, date) {
    const r = get(iso), k = kind(r);
    if (k && !k.need && expired(r, date)) return `<span class="b ec-b ec-visa" title="${esc(`${name(iso)}: ${untilTxt(r)} ${r.notes || ''} ${srcTxt(r)}.`)}">⏳ ověř vstup</span>`;
    if (!k || !k.need) return '';
    const eur = Number(r.etaCostEur);
    const cost = (r.visa === 'eta' || r.visa === 'evisa') && r.etaCostEur != null && eur >= 0 ? (eur === 0 ? ' zdarma' : ` ${eur} €`) : '';
    return `<span class="b ec-b ec-${k.cls}" title="${esc(tip(iso, r, k))}">${k.icon} ${esc(k.label + q(r) + cost)}</span>`;
  }
  /** „🪪 stačí OP“ do rozbaleného detailu letu (jen kde OP stačí). */
  function idNote(iso) {
    const r = get(iso);
    return r && r.idCard && r.iso2 !== 'CZ' ? `<span class="ec-id" title="${esc(`${name(iso)}: ${kind(r).text}. ${srcTxt(r)}`)}">🪪 stačí OP</span>` : '';
  }

  /* ---------- tranzit ---------- */
  /**
   * Přestupy v zemích, kde registrace platí i pro tranzit: transitEta true = i bez pasové kontroly (USA, Kanada),
   * 'landside' = jen když se při přestupu prochází pasovou kontrolou (Velká Británie – typicky samostatné letenky).
   * legs: lety s layovers [{ at, min, cc }]; cílové země (kód nebo seznam) se vynechají – ty řeší čip cíle.
   */
  function transit(legs, destCc) {
    const out = [], seen = new Set([].concat(destCc || []).map(canon));
    for (const l of legs || []) {
      for (const x of (l && l.layovers) || []) {
        const r = get(x.cc), cc = canon(x.cc);
        if (!r || !r.transitEta || seen.has(cc)) continue;
        seen.add(cc);
        const where = IN_CS[cc] || `v zemi ${name(x.cc)}`, reg = regName(r), land = r.transitEta === 'landside', price = priceTxt(r.etaCostEur);
        out.push({
          cc, at: x.at, landside: land,
          text: land ? `✈︎ přestup ${where} – s pasovou kontrolou nutná ${reg}` : `✈︎ přestup ${where} – i tranzit vyžaduje ${reg}`,
          title: land
            ? `${x.at}: ${r.etaName || 'registrace'} je nutná i při přestupu, pokud procházíš pasovou kontrolou (samostatné letenky, vyzvedávání zavazadel); bez ní jen tranzit bez opuštění tranzitního prostoru${price ? ` – ${price}` : ''}. ${srcTxt(r)}.`
            : `${x.at}: ${r.etaName || 'registrace'} je nutná i při přestupu na letišti${price ? ` – ${price}` : ''}. ${srcTxt(r)}.`,
        });
      }
    }
    return out;
  }
  const transitHtml = (legs, destCc) => transit(legs, destCc).map(w => `<span class="b ${w.landside ? 'warn' : 'hot'} ec-warn" title="${esc(w.title)}">${esc(w.text)}</span>`).join('');
  /** Země přestupu, kde je potřeba registrace (pro „Před cestou“, poplatky a připomínku) – kódy zemí. */
  const transitCcs = (legs, destCc) => transit(legs, destCc).map(w => w.cc);

  /* ---------- platnost pasu ---------- */
  /**
   * Lhůty z textu pravidla (měsíce i dny), nejdelší vyhrává – raději přísnější. Část s „doporuč…“ je jen doporučení
   * (rec…), část se záporem („6 měsíců není úředně vyžadováno“) se nepočítá.
   * „6 měsíců po vstupu“ → { months: 6, days: 0, recMonths: 0, recDays: 0 }; „po dobu pobytu (doporučeno 6 měsíců)“ → recMonths: 6.
   */
  function passportRule(text) {
    const out = { months: 0, days: 0, recMonths: 0, recDays: 0 };
    const parts = String(text || '').split(/[;()]/);
    parts.forEach((p, i) => {
      if (/(^|\s)ne(ní|vyžad|požad)/i.test(p)) return;
      // „6 měsíců po odjezdu (doporučeno)“ – doporučení v závorce za číslem
      const rec = /doporuč/i.test(p) || (/doporuč/i.test(parts[i + 1] || '') && !/\d/.test(parts[i + 1]));
      for (const m of p.matchAll(/(\d+)\s*(?:měsíc[eů]?|měs\.)/g)) { const k = rec ? 'recMonths' : 'months'; out[k] = Math.max(out[k], +m[1]); }
      for (const m of p.matchAll(/(\d+)\s*(?:dní|dnů|dny|den)(?![\p{L}])/gu)) { const k = rec ? 'recDays' : 'days'; out[k] = Math.max(out[k], +m[1]); }
    });
    return out;
  }
  const later = (ret, months, days) => { const a = months ? addMonths(ret, months) : ret, b = days ? addDays(ret, days) : ret; return a > b ? a : b; };
  /**
   * Do kdy musí (until) a do kdy je doporučeno (rec, jen když je později) pas platit, počítáno od návratu
   * (pro jistotu, i když pravidlo mluví o vstupu); null = lhůta neuvedena („po dobu pobytu“).
   */
  function passportDates(text, ret) {
    if (!isYmd(ret)) return { until: null, rec: null };
    const { months, days, recMonths, recDays } = passportRule(text);
    const until = months || days ? later(ret, months, days) : null;
    const rec = recMonths || recDays ? later(ret, recMonths, recDays) : null;
    return { until, rec: rec && (!until || rec > until) ? rec : null };
  }
  const passportUntil = (text, ret) => passportDates(text, ret).until;

  /* ---------- předstih a připomínka ---------- */
  /** Kolik dní předem žádat podle poznámek („žádat min. 4 dny předem“, „vyřízení 3 prac. dny“, „až 45 dní“); null = neuvedeno. */
  function leadDays(r) {
    const s = String((r && r.notes) || '');
    let best = null;
    const up = v => { if (v > 0) best = Math.max(best || 0, v); };
    const n = m => +(m[2] || m[1]);
    for (const m of s.matchAll(/(\d+)(?:\s*[–-]\s*(\d+))?\s*prac(?:\.|ovní(?:ch)?)\s*(?:dn|den)/g)) up(Math.ceil(n(m) * 7 / 5));
    // „nejdříve / až 15 dní předem“ = jak brzy nejdřív, ne předstih
    for (const m of s.matchAll(/(nejdříve\s+|až\s+)?(\d+)(?:\s*[–-]\s*(\d+))?\s*(?:dny|dní|dnů|den)\s+(?:předem|před\s+(?:letem|odletem|cestou))/g)) if (!m[1]) up(+(m[3] || m[2]));
    for (const m of s.matchAll(/vyříz\S*\s+(?:až\s+|do\s+)?(\d+)(?:\s*[–-]\s*(\d+))?\s*(h|dny|dní|dnů|den)(?![\p{L}])/gu)) up(m[3] === 'h' ? Math.ceil(n(m) / 24) : n(m));
    for (const m of s.matchAll(/(nejdříve\s+)?(\d+)\s*h\s+předem/g)) if (!m[1]) up(Math.ceil(+m[2] / 24));
    for (const m of s.matchAll(/(\d+)\s*týdn/g)) up(+m[1] * 7);
    return best;
  }
  /** Dní před odletem pro připomínku: 14 (registrace, e-vízum), 30 (vízum), víc při dlouhém vyřízení (+ týden rezerva). */
  function remindDays(r) {
    const lead = leadDays(r);
    return Math.max(LEAD[r.visa] || 14, lead ? lead + 7 : 0);
  }
  const what = r => (r.visa === 'visa' ? 'vízum' : r.visa === 'evisa' ? 'e-vízum' : regName(r));
  const daysTxt = n => `${n} ${n === 1 ? 'den' : n < 5 ? 'dny' : 'dní'}`;
  /**
   * Událost do kalendáře „🛂 Vyřídit ESTA (USA)“ před odletem; null, když se nic předem nevyřizuje.
   * today: dnešek (YYYY-MM-DD) – připomínka v minulosti se posune na dnešek, po odletu žádná.
   * transit: země jen přestupu (registrace platí i pro tranzit).
   */
  function reminder(iso, depart, today, { transit: via = false } = {}) {
    const r = get(iso);
    if (!r || !ARRANGE.includes(r.visa) || !isYmd(depart)) return null;
    let date = addDays(depart, -remindDays(r));
    if (isYmd(today) && date < today) { if (today >= depart) return null; date = today; }
    const lead = leadDays(r);
    return {
      title: `🛂 Vyřídit ${what(r)} (${shortName(iso)}${via ? ' – přestup' : ''})`,
      start: date,
      // stálé UID: nový export (třeba s připomínkou posunutou na dnešek) událost v kalendáři přepíše, nezdvojí
      uid: `atlas-entry-${canon(iso)}-${depart}`,
      url: safeUrl(r.etaUrl || r.source) === '#' ? undefined : safeUrl(r.etaUrl || r.source),
      description: [
        `${name(iso)}: ${kind(r).text}.${via ? ' Platí i při přestupu.' : ''}`,
        r.etaCostEur != null ? `Poplatek: ${priceTxt(r.etaCostEur)} na osobu.` : '',
        lead ? `Na vyřízení si nech aspoň ${daysTxt(lead)}.` : '',
        r.notes || '',
        r.etaUrl ? `Jen oficiální web: ${r.etaUrl}` : '',
        `Odlet: ${dmy(depart)}. ${srcTxt(r)} – před cestou ověř na ${(DATA && DATA.sourceUrl) || 'mzv.gov.cz'}.`,
      ].filter(Boolean).join('\n'),
    };
  }

  /* ---------- před cestou ---------- */
  // platné kódy bez Česka; území USA (Portoriko…) a USA jsou jedna položka (stejná ESTA)
  const uniq = list => {
    const seen = new Set();
    return (list || []).filter(x => /^[A-Z]{2}$/.test(x || '') && x !== 'CZ' && !seen.has(canon(x)) && seen.add(canon(x)));
  };
  /** Cílové země + země jen přestupu (via), které cílem nejsou: [{ iso, transit }]. */
  const tripList = (isos, via) => {
    const dest = uniq(isos), have = new Set(dest.map(canon));
    return [...dest.map(iso => ({ iso, transit: false })), ...uniq(via).filter(x => !have.has(canon(x))).map(iso => ({ iso, transit: true }))];
  };
  /** Doklad a platnost pasu jednou větou. */
  function docsTxt(r, until, rec) {
    const recTxt = rec ? `doporučená platnost aspoň do ${dmy(rec)}` : '';
    return r.idCard
      ? `🪪 Stačí občanský průkaz (nebo pas)${until ? ` platný aspoň do ${dmy(until)}` : ''}${recTxt ? ` – ${recTxt}` : ''}`
      : `🛂 Cestovní pas${until ? ` platný aspoň do ${dmy(until)}` : ''}${recTxt ? ` (${recTxt})` : ''} – občanský průkaz nestačí`;
  }
  /**
   * Položky „Před cestou“ pro země cesty: doklady, registrace/vízum, očkování, poznámky. ret = datum návratu,
   * via = země přestupu, kde registrace platí i pro tranzit (transit: true).
   */
  function checklist(isos, { ret = null, via = [] } = {}) {
    return tripList(isos, via).map(({ iso, transit: tr }) => {
      const r = get(iso), k = kind(r);
      if (!k) return null;
      // jen přestup: lhůta platnosti pasu se týká vstupu do země, datum se nepočítá
      const { until, rec } = passportDates(r.passportValidity, tr ? null : ret);
      return { iso, rec: r, kind: k, transit: tr, docs: docsTxt(r, until, rec), rule: r.visa === 'eu' ? '' : r.passportValidity || '', until, recUntil: rec, lead: leadDays(r), expired: expired(r, ret) };
    }).filter(Boolean);
  }
  /** Připomínky do kalendáře pro všechny země cesty (i přestupy s registrací) – každá registrace jednou. */
  function reminders(isos, depart, today, via = []) {
    return tripList(isos, via).map(x => {
      const r = get(x.iso);
      // podmíněný tranzit (jen s pasovou kontrolou) bez připomínky – rozhoduje typ letenky
      return x.transit && r && r.transitEta !== true ? null : reminder(x.iso, depart, today, { transit: x.transit });
    }).filter(Boolean);
  }
  /** Vstupní poplatky na celou skupinu: [{ iso, label, eur, czk }] (registrace, e-vízum, vízum s udanou cenou). */
  function costs(isos, pax = 1, via = []) {
    const k = eurCzk();
    return tripList(isos, via).map(({ iso, transit: tr }) => {
      const r = get(iso);
      if (!r || !NEED.includes(r.visa) || !(r.etaCostEur > 0) || (tr && r.transitEta !== true)) return null;
      const p = Math.max(1, pax | 0);
      // na desítky Kč jako ostatní orientační částky
      return { iso, label: `${what(r)} (${shortName(iso)}${tr ? ', přestup' : ''}) · ${p} × ~${r.etaCostEur} €`, eur: r.etaCostEur * p, czk: Math.round(r.etaCostEur * p * k / 10) * 10 };
    }).filter(Boolean);
  }
  const link = (u, txt) => (safeUrl(u) === '#' ? '' : `<a href="${esc(safeUrl(u))}" target="_blank" rel="noopener">${esc(txt)}</a>`);
  const disclaimer = () => `Informativní přehled ${DATA && DATA.source ? `(${esc(DATA.source)}, ověřeno ${esc(checkedTxt())})` : ''} – pravidla se mění, před cestou vždy ověř aktuální podmínky na ${link((DATA && DATA.sourceUrl) || 'https://www.mzv.gov.cz/jnp/cz/cestujeme/index.html', 'webu MZV ČR')}.`;
  // u přestupu: platí vždy, nebo jen s pasovou kontrolou
  const transitTxt = r => (r.transitEta === 'landside' ? 'nutná i při přestupu, pokud procházíš pasovou kontrolou (samostatné letenky, vyzvedávání zavazadel)' : 'platí i při přestupu');
  /** Karta „🛂 Před cestou“ (průvodce cestou, plánovač); '' když data nejsou nebo cesta nemá zemi. */
  function checklistHtml(isos, { ret = null, pax = 1, via = [] } = {}) {
    const items = checklist(isos, { ret, via });
    if (!items.length) return '';
    const fee = r => (r.etaCostEur > 0 ? `${priceTxt(r.etaCostEur)} na osobu${pax > 1 ? ` (${pax} os. ≈ ${kc(r.etaCostEur * pax * eurCzk())})` : ''}` : r.etaCostEur === 0 ? 'zdarma' : '');
    const rows = items.map(({ iso, rec: r, kind: k, transit: tr, docs, rule, lead, expired: old }) => {
      const li = [];
      if (old) li.push(`<li class="ed-unv">⏳ ${esc(untilTxt(r))}</li>`);
      li.push(`<li>${esc(docs)}${rule ? ` <span class="faint">(${esc(rule)})</span>` : ''}</li>`);
      if (k.need) {
        const f = fee(r);
        li.push(`<li><b>${esc(k.icon)} ${esc(k.text)}</b>${f ? ` · ${esc(f)}` : ''}${lead ? ` · <span class="faint">žádej aspoň ${daysTxt(lead)} předem</span>` : ''}${r.etaUrl ? ` · ${link(r.etaUrl, 'oficiální web ↗')}` : ''}${r.transitEta ? ` <span class="faint">· ${esc(transitTxt(r))}</span>` : ''}</li>`);
      } else if (r.etaName) li.push(`<li>${esc(r.etaName)}${r.etaUrl ? ` · ${link(r.etaUrl, 'web ↗')}` : ''}</li>`);
      // jen přestup: pobyt a očkování země se netýkají
      if (!tr && r.maxStayDays && r.visa !== 'eu') li.push(`<li>Pobyt nejvýš ${esc(stayTxt(r))}</li>`);
      if (!tr && r.vaccinesRequired) li.push(`<li>💉 Povinné očkování: ${esc(r.vaccinesRequired)}</li>`);
      if (!tr && r.vaccinesRecommended) li.push(`<li>💉 Doporučené očkování: ${esc(r.vaccinesRecommended)}</li>`);
      if (r.notes) li.push(`<li class="faint">${esc(r.notes)}</li>`);
      if (!r.verified) li.push(`<li class="ed-unv">⚠️ ${esc(UNVERIFIED)}</li>`);
      return `<div class="pc-country"><div class="pc-h">${typeof flag === 'function' ? flag(iso) + ' ' : ''}<b>${esc(name(iso))}</b>${tr ? ' <span class="faint">– jen přestup</span>' : ''} <span class="ec ec-${k.cls}">${k.icon ? k.icon + ' ' : ''}${esc(k.label + q(r))}</span></div>
        <ul class="pc-list">${li.join('')}</ul><div class="faint pc-src">${link(r.source, srcTxt(r))}</div></div>`;
    }).join('');
    return `<div class="card step-card entry-card"><h3>🛂 Před cestou</h3>${rows}<div class="note warn" style="margin-top:10px">⚠️ <div>${disclaimer()}</div></div></div>`;
  }

  /** Sekce „🛂 Vstup pro občany ČR“ v detailu země. */
  function detailHtml(iso) {
    const r = get(iso), k = kind(r);
    if (!k) return '';
    if (r.iso2 === 'CZ') return '';
    const tr = r.transitEta === 'landside' ? '✈︎ Nutná i při přestupu, pokud procházíš pasovou kontrolou (samostatné letenky, vyzvedávání zavazadel).' : '✈︎ Nutná i při přestupu (leteckém tranzitu) v této zemi.';
    const reg = r.etaName ? `<div class="ed-reg">${esc(r.etaName)}${r.etaCostEur != null ? ` · <b>${esc(priceTxt(r.etaCostEur))}</b>${k.need ? ' na osobu' : ''}` : ''}${r.etaUrl ? ` · ${link(r.etaUrl, 'oficiální web ↗')}` : ''}${r.transitEta ? `<div class="ed-transit">${esc(tr)}</div>` : ''}</div>` : '';
    return `<div class="entry-detail">
      <h3>🛂 Vstup pro občany ČR</h3>
      <div class="ed-regime ec-${k.cls}">${k.icon ? k.icon + ' ' : ''}${esc(k.text)}</div>
      ${reg}
      ${r.verified ? '' : `<div class="ed-unv">⚠️ ${esc(UNVERIFIED)}</div>`}
      ${r.validUntil ? `<div class="ed-unv">⏳ ${esc(untilTxt(r))}</div>` : ''}
      <div class="kv ed-kv">
        <div><div class="k">Doklad</div><div class="v">${r.idCard ? '🪪 stačí OP' : '🛂 jen pas'}</div></div>
        <div><div class="k">Max. pobyt</div><div class="v">${esc(stayTxt(r))}</div></div>
        <div><div class="k">Platnost pasu</div><div class="ed-small">${esc(r.passportValidity || '—')}</div></div>
      </div>
      <div class="ed-vac"><b>💉 Povinné očkování:</b> ${esc(r.vaccinesRequired || 'žádné')}</div>
      ${r.vaccinesRecommended ? `<div class="ed-vac"><b>💉 Doporučené:</b> ${esc(r.vaccinesRecommended)}</div>` : ''}
      ${r.notes ? `<p class="ed-notes">${esc(r.notes)}</p>` : ''}
      <div class="faint ed-src">${link(r.source, srcTxt(r))}</div>
      <div class="note warn ed-note">⚠️ <div>${disclaimer()}</div></div>
    </div>`;
  }

  /** Filtr seznamu zemí: 'op' = stačí OP, 'free' = bez víza i bez registrace. */
  function matches(iso, f) {
    const r = get(iso);
    if (!f || !DATA) return true;
    if (!r) return false;
    return f === 'op' ? r.idCard : f === 'free' ? r.visa === 'eu' || r.visa === 'none' : true;
  }

  window.Entry = {
    set, load, ready, whenReady, get, meta, setRate, eurCzk, kind, regName, cardChip, flightChip, idNote, transit, transitHtml, transitCcs,
    passportRule, passportDates, passportUntil, addMonths, leadDays, remindDays, reminder, reminders, checklist, costs, checklistHtml, detailHtml, matches, checkedTxt,
  };
})();
