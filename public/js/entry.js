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
  const IN_CS = { US: 'v USA', CA: 'v Kanadě', GB: 've Spojeném království' };

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
  const name = iso => (typeof byIso !== 'undefined' && byIso[iso] ? byIso[iso].cs : iso);
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
  const get = iso => BY[String(iso || '').toUpperCase()] || null;
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
    const via = r.etaName ? ` (${r.etaName})` : '';
    switch (r.visa) {
      case 'eu': return { key: 'op', icon: '🪪', label: 'stačí OP', cls: 'ok', need: false, text: 'EU / Schengen – volný pohyb, stačí občanský průkaz' };
      case 'none': return r.idCard
        ? { key: 'op', icon: '🪪', label: 'stačí OP', cls: 'ok', need: false, text: 'Bez víza – stačí i občanský průkaz' }
        : { key: 'free', icon: '', label: 'bez víza', cls: 'free', need: false, text: 'Bez víza – jen s cestovním pasem' };
      case 'eta': return { key: 'eta', icon: '🛂', label: regName(r), cls: 'reg', need: true, text: `Bez víza, ale nutná online registrace předem${via}` };
      case 'evisa': return { key: 'evisa', icon: '🛂', label: 'e-vízum', cls: 'visa', need: true, text: `Nutné e-vízum – vyřídíš online předem${via}` };
      case 'voa': return { key: 'voa', icon: '🛂', label: 'vízum na hranici', cls: 'visa', need: true, text: `Vízum při příletu na hranici${r.etaName ? `, nebo předem online${via}` : ''}` };
      case 'visa': return { key: 'visa', icon: '📄', label: 'vízum předem', cls: 'hard', need: true, text: `Vízum předem na zastupitelském úřadě${r.etaName ? ` (online žádost: ${r.etaName})` : ''}` };
      default: return null;
    }
  }
  const stayTxt = r => (r.visa === 'eu' ? 'bez omezení (EU)' : r.maxStayDays ? `${r.maxStayDays} dní` : 'neuvedeno');
  const srcTxt = r => `Zdroj: ${/(^|\.)mzv\.gov\.cz$/.test(hostOf(r.source)) ? 'MZV ČR' : hostOf(r.source)} (ověřeno ${checkedTxt()})${r.verified ? '' : ' – neověřeno na oficiální stránce'}`;
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
    return `<span class="ec ec-${k.cls}" title="${esc(tip(iso, r, k))}">${k.icon ? k.icon + ' ' : ''}${esc(k.label)}</span>`;
  }
  /** Čip k letu – jen když je co vyřizovat (registrace, e-vízum, vízum na hranici, vízum). */
  function flightChip(iso) {
    const r = get(iso), k = kind(r);
    if (!k || !k.need) return '';
    const cost = (r.visa === 'eta' || r.visa === 'evisa') && r.etaCostEur != null ? (r.etaCostEur === 0 ? ' zdarma' : ` ${r.etaCostEur} €`) : '';
    return `<span class="b ec-b ec-${k.cls}" title="${esc(tip(iso, r, k))}">${k.icon} ${esc(k.label)}${cost}</span>`;
  }
  /** „🪪 stačí OP“ do rozbaleného detailu letu (jen kde OP stačí). */
  function idNote(iso) {
    const r = get(iso);
    return r && r.idCard && r.iso2 !== 'CZ' ? `<span class="ec-id" title="${esc(`${name(iso)}: ${kind(r).text}. ${srcTxt(r)}`)}">🪪 stačí OP</span>` : '';
  }

  /* ---------- tranzit ---------- */
  /**
   * Přestupy v zemích, kde registrace platí i pro letecký tranzit (transitEta – USA, Kanada).
   * legs: lety s layovers [{ at, min, cc }]; cílové země (kód nebo seznam) se vynechají – ty řeší čip cíle.
   */
  function transit(legs, destCc) {
    const out = [], seen = new Set([].concat(destCc || []));
    for (const l of legs || []) {
      for (const x of (l && l.layovers) || []) {
        const r = get(x.cc);
        if (!r || !r.transitEta || seen.has(x.cc)) continue;
        seen.add(x.cc);
        const where = IN_CS[x.cc] || `v zemi ${name(x.cc)}`;
        out.push({ cc: x.cc, at: x.at, text: `✈︎ přestup ${where} – i tranzit vyžaduje ${regName(r)}`, title: `${x.at}: ${name(x.cc)} vyžaduje ${r.etaName || 'registraci'} i při přestupu na letišti (${priceTxt(r.etaCostEur)}). ${srcTxt(r)}.` });
      }
    }
    return out;
  }
  const transitHtml = (legs, destCc) => transit(legs, destCc).map(w => `<span class="b hot ec-warn" title="${esc(w.title)}">${esc(w.text)}</span>`).join('');

  /* ---------- platnost pasu ---------- */
  /** Nejdelší lhůta z textu pravidla (měsíce i dny) – raději přísnější: „6 měsíců po vstupu“ → { months: 6, days: 0 }. */
  function passportRule(text) {
    const s = String(text || '');
    let months = 0, days = 0;
    for (const m of s.matchAll(/(\d+)\s*(?:měsíc[eů]?|měs\.)/g)) months = Math.max(months, +m[1]);
    for (const m of s.matchAll(/(\d+)\s*(?:dní|dnů|dny|den)(?![\p{L}])/gu)) days = Math.max(days, +m[1]);
    return { months, days };
  }
  /** Do kdy musí pas platit, počítáno od návratu (pro jistotu, i když pravidlo mluví o vstupu); null = lhůta neuvedena. */
  function passportUntil(text, ret) {
    if (!isYmd(ret)) return null;
    const { months, days } = passportRule(text);
    if (!months && !days) return null;
    const a = months ? addMonths(ret, months) : ret, b = days ? addDays(ret, days) : ret;
    return a > b ? a : b;
  }

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
  /**
   * Událost do kalendáře „🛂 Vyřídit ESTA (USA)“ před odletem; null, když se nic předem nevyřizuje.
   * today: dnešek (YYYY-MM-DD) – připomínka v minulosti se posune na dnešek, po odletu žádná.
   */
  function reminder(iso, depart, today) {
    const r = get(iso);
    if (!r || !ARRANGE.includes(r.visa) || !isYmd(depart)) return null;
    let date = addDays(depart, -remindDays(r));
    if (isYmd(today) && date < today) { if (today >= depart) return null; date = today; }
    const lead = leadDays(r);
    return {
      title: `🛂 Vyřídit ${what(r)} (${shortName(iso)})`,
      start: date,
      url: safeUrl(r.etaUrl || r.source) === '#' ? undefined : safeUrl(r.etaUrl || r.source),
      description: [
        `${name(iso)}: ${kind(r).text}.`,
        r.etaCostEur != null ? `Poplatek: ${priceTxt(r.etaCostEur)} na osobu.` : '',
        lead ? `Vyřízení podle MZV / úřadů: počítej aspoň s ${lead} ${lead === 1 ? 'dnem' : 'dny'}.` : '',
        r.notes || '',
        r.etaUrl ? `Jen oficiální web: ${r.etaUrl}` : '',
        `Odlet: ${dmy(depart)}. ${srcTxt(r)} – před cestou ověř na ${(DATA && DATA.sourceUrl) || 'mzv.gov.cz'}.`,
      ].filter(Boolean).join('\n'),
    };
  }

  /* ---------- před cestou ---------- */
  const uniq = list => [...new Set((list || []).filter(x => /^[A-Z]{2}$/.test(x || '') && x !== 'CZ'))];
  /** Položky „Před cestou“ pro země cesty: doklady, registrace/vízum, očkování, poznámky. ret = datum návratu. */
  function checklist(isos, { ret = null } = {}) {
    return uniq(isos).map(iso => {
      const r = get(iso), k = kind(r);
      if (!k) return null;
      const until = passportUntil(r.passportValidity, ret);
      const docs = r.idCard
        ? `🪪 Stačí platný občanský průkaz (nebo pas)${until ? ` – platný aspoň do ${dmy(until)}` : ''}`
        : `🛂 Cestovní pas${until ? ` platný aspoň do ${dmy(until)}` : ''} – občanský průkaz nestačí`;
      return { iso, rec: r, kind: k, docs, rule: r.visa === 'eu' ? '' : r.passportValidity || '', until, lead: leadDays(r) };
    }).filter(Boolean);
  }
  /** Vstupní poplatky na celou skupinu: [{ iso, label, eur, czk }] (registrace, e-vízum, vízum s udanou cenou). */
  function costs(isos, pax = 1) {
    const k = eurCzk();
    return uniq(isos).map(iso => {
      const r = get(iso);
      if (!r || !NEED.includes(r.visa) || !(r.etaCostEur > 0)) return null;
      const p = Math.max(1, pax | 0);
      // na desítky Kč jako ostatní orientační částky
      return { iso, label: `${r.etaName || what(r)} (${shortName(iso)}) · ${p} × ~${r.etaCostEur} €`, eur: r.etaCostEur * p, czk: Math.round(r.etaCostEur * p * k / 10) * 10 };
    }).filter(Boolean);
  }
  const link = (u, txt) => (safeUrl(u) === '#' ? '' : `<a href="${esc(safeUrl(u))}" target="_blank" rel="noopener">${esc(txt)}</a>`);
  const disclaimer = () => `Informativní přehled ${DATA && DATA.source ? `(${esc(DATA.source)}, ověřeno ${esc(checkedTxt())})` : ''} – pravidla se mění, před cestou vždy ověř aktuální podmínky na ${link((DATA && DATA.sourceUrl) || 'https://www.mzv.gov.cz/jnp/cz/cestujeme/index.html', 'webu MZV ČR')}.`;
  /** Karta „🛂 Před cestou“ (průvodce cestou, plánovač); '' když data nejsou nebo cesta nemá zemi. */
  function checklistHtml(isos, { ret = null, pax = 1 } = {}) {
    const items = checklist(isos, { ret });
    if (!items.length) return '';
    const fee = r => (r.etaCostEur > 0 ? `${priceTxt(r.etaCostEur)} na osobu${pax > 1 ? ` (${pax} os. ≈ ${kc(r.etaCostEur * pax * eurCzk())})` : ''}` : r.etaCostEur === 0 ? 'zdarma' : '');
    const rows = items.map(({ iso, rec: r, kind: k, docs, rule, lead }) => {
      const li = [];
      li.push(`<li>${esc(docs)}${rule ? ` <span class="faint">(${esc(rule)})</span>` : ''}</li>`);
      if (k.need) {
        const f = fee(r);
        li.push(`<li><b>${esc(k.icon)} ${esc(k.text)}</b>${f ? ` · ${esc(f)}` : ''}${lead ? ` · <span class="faint">žádej aspoň ${lead} ${lead === 1 ? 'den' : lead < 5 ? 'dny' : 'dní'} předem</span>` : ''}${r.etaUrl ? ` · ${link(r.etaUrl, 'oficiální web ↗')}` : ''}${r.transitEta ? ' <span class="faint">· platí i při přestupu</span>' : ''}</li>`);
      } else if (r.etaName) li.push(`<li>${esc(r.etaName)}${r.etaUrl ? ` · ${link(r.etaUrl, 'web ↗')}` : ''}</li>`);
      if (r.maxStayDays && r.visa !== 'eu') li.push(`<li>Pobyt nejvýš ${esc(stayTxt(r))}</li>`);
      if (r.vaccinesRequired) li.push(`<li>💉 Povinné očkování: ${esc(r.vaccinesRequired)}</li>`);
      if (r.vaccinesRecommended) li.push(`<li>💉 Doporučené očkování: ${esc(r.vaccinesRecommended)}</li>`);
      if (r.notes) li.push(`<li class="faint">${esc(r.notes)}</li>`);
      return `<div class="pc-country"><div class="pc-h">${typeof flag === 'function' ? flag(iso) + ' ' : ''}<b>${esc(name(iso))}</b> <span class="ec ec-${k.cls}">${k.icon ? k.icon + ' ' : ''}${esc(k.label)}</span></div>
        <ul class="pc-list">${li.join('')}</ul><div class="faint pc-src">${link(r.source, srcTxt(r))}</div></div>`;
    }).join('');
    return `<div class="card step-card entry-card"><h3>🛂 Před cestou</h3>${rows}<div class="note warn" style="margin-top:10px">⚠️ <div>${disclaimer()}</div></div></div>`;
  }

  /** Sekce „🛂 Vstup pro občany ČR“ v detailu země. */
  function detailHtml(iso) {
    const r = get(iso), k = kind(r);
    if (!k) return '';
    if (r.iso2 === 'CZ') return '';
    const reg = r.etaName ? `<div class="ed-reg">${esc(r.etaName)}${r.etaCostEur != null ? ` · <b>${esc(priceTxt(r.etaCostEur))}</b>${k.need ? ' na osobu' : ''}` : ''}${r.etaUrl ? ` · ${link(r.etaUrl, 'oficiální web ↗')}` : ''}${r.transitEta ? '<div class="ed-transit">✈︎ Nutná i při přestupu (leteckém tranzitu) v této zemi.</div>' : ''}</div>` : '';
    return `<div class="entry-detail">
      <h3>🛂 Vstup pro občany ČR</h3>
      <div class="ed-regime ec-${k.cls}">${k.icon ? k.icon + ' ' : ''}${esc(k.text)}</div>
      ${reg}
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
    set, load, ready, whenReady, get, meta, setRate, eurCzk, kind, regName, cardChip, flightChip, idNote, transit, transitHtml,
    passportRule, passportUntil, addMonths, leadDays, remindDays, reminder, checklist, costs, checklistHtml, detailHtml, matches, checkedTxt,
  };
})();
