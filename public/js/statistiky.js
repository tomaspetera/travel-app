/* ATLAS – stránka Statistiky pro majitele (public/statistiky.html): čitelný přehled souhrnných počtů z GET api/stats
   (server/lib/counts.js) na telefonu místo syrového JSON. Jen čte denní součty – nic neukládá. Když je na serveru
   STATS_KEY (odpověď 401), zeptá se na klíč a drží ho jen v paměti stránky (posílá v hlavičce Authorization).
   Výpočty jsou čisté funkce ve window.Stats (test/statistiky.test.js přes node:vm); vykreslení běží jen ve stránce
   s #stats, takže se soubor dá načíst i bez prohlížeče. */
(function () {
  // Názvy událostí přesně jako EVENTS v server/lib/counts.js – jiný název by se tiše ukazoval jako 0
  const MAIN = [
    ['app_open', 'Otevření aplikace'],
    ['search_done', 'Dokončená hledání'],
    ['search_anywhere', 'z toho kamkoliv'],
    ['verify_click', 'Ověření ceny'],
    ['buy_click', 'Prokliky k prodejci'],
    ['trip_started', 'Otevřený průvodce cestou'],
    ['trip_auto', '⚡ Poskládej'],
    ['trip_summary', 'Shrnutí cesty'],
    ['trip_saved', 'Uložené cesty'],
    ['share', 'Sdílení'],
    ['calendar_export', 'Do kalendáře'],
    ['have_ticket_start', '„Mám letenku“'],
  ];
  // Odpovědi průzkumu: hodnota v Kč kvůli mediánu a hranici 399 Kč
  const PRICES = [['price_0', 0, 'Nic'], ['price_199', 199, '199 Kč'], ['price_399', 399, '399 Kč'], ['price_599', 599, '599 Kč'], ['price_799', 799, '799 Kč']];
  // Falešné dveře: kolikrát se nabídka ukázala → kolikrát na ni někdo klepl
  const DOORS = [
    { shown: 'limit_shown', label: 'Hláška o limitu', clicks: [['limit_plus', 'chci Plus'], ['limit_download', 'stáhnout'], ['limit_replace', 'nahradit']] },
    { shown: 'plus_offer_shown', label: 'Nabídka Plus', clicks: [['plus_offer_click', 'klepnutí']] },
    { shown: 'sesit_shown', label: 'Sešit', clicks: [['sesit_click', 'klepnutí']] },
  ];
  const VIEWS = [['view_dashboard', 'Přehled'], ['view_flights', 'Lety'], ['view_trip', 'Průvodce cestou'], ['view_trips', 'Moje cesty'], ['view_explore', 'Objevuj'], ['view_world', 'Svět (mapa a země)']];
  const TABLE = [['app_open', 'Otevř.'], ['search_done', 'Hled.'], ['verify_click', 'Ověř.'], ['buy_click', 'Prokl.'], ['trip_started', 'Prův.'], ['trip_saved', 'Ulož.']];
  // Kde to drhne (počty dělá server sám ze svých odpovědí): [událost, základ = události, jejichž součet je 100, popisek].
  // Bez základu (ještě ho nikdo nepočítá) jen počet.
  const SNAGS = [
    ['search_empty', ['search_done'], 'Hledání bez nabídek'],
    ['search_limit', ['search_done'], 'Hledání nad limitem'],
    ['search_busy', ['search_done'], 'Hledání odmítnuté – server plný'],
    ['search_error', ['search_done'], 'Hledání s chybou'],
    ['shared_broken', ['shared_open', 'shared_broken'], 'Nefunkční sdílený odkaz'],
    ['js_error', ['app_open'], 'Chyba aplikace v prohlížeči'],
    ['stay_empty', [], 'Ubytování bez nabídek'],
  ];
  // Krátké otázky (Count.ask v count.js): přesné znění a volby jako v aplikaci. Počítá se jen klepnutá odpověď –
  // zobrazení ne, takže podíl odpovědí ze zobrazení spočítat nejde.
  const QUESTIONS = [
    { q: 'Prázdný výsledek letů: Co by ti teď pomohlo nejvíc?', opts: [['mq_empty_place', 'Jiné letiště poblíž'], ['mq_empty_dates', 'Volnější termíny'], ['mq_empty_lost', 'Nevím, co zkusit'], ['mq_empty_try', 'Jen zkouším']] },
    { q: 'Po návratu od prodejce: Seděla cena u prodejce?', opts: [['mq_price_same', 'Ano'], ['mq_price_higher', 'Byla vyšší'], ['mq_price_gone', 'Let už nebyl']] },
    { q: 'Po ↺ Začít znovu: Proč začínáš znovu?', opts: [['mq_restart_date', 'Jiný let nebo termín'], ['mq_restart_price', 'Moc draho'], ['mq_restart_lost', 'Nevyznal/a jsem se'], ['mq_restart_try', 'Jen zkouším']] },
    { q: 'Shrnutí cesty: Pomohl ti průvodce naplánovat cestu?', opts: [['mq_trip_good', 'Ano, hodně'], ['mq_trip_missing', 'Něco chybělo'], ['mq_trip_lost', 'Nevyznal/a jsem se']] },
    { q: 'Objevuj bez výsledku: Co jsi hledal/a?', opts: [['mq_ex_city', 'Město'], ['mq_ex_nature', 'Vesnici nebo přírodu'], ['mq_ex_region', 'Oblast nebo zemi'], ['mq_ex_other', 'Něco jiného']] },
  ];
  // Opakované klepnutí podle sekce (count.js, jen se souhlasem Pomáhat se zlepšováním)
  const RAGE = [['rage_dashboard', 'Přehled'], ['rage_flights', 'Lety'], ['rage_trip', 'Průvodce a Moje cesty'], ['rage_explore', 'Objevuj'], ['rage_world', 'Svět']];
  // Podrobné počty v Letech (Count.deep): posílají je jen lidé se zapnutou pomocí „Pomáhat se zlepšováním“, základ
  // (otevření Letů, dokončená hledání, hledání bez nabídek) ale počítají všichni – poměr je proto spodní odhad a víc
  // říká pořadí řádků a jejich změna v čase než samotné číslo. Výjimka: věty a rozložení pořadí mají základ jen z nich.
  const SENTENCES = ['sentence_ok', 'sentence_miss', 'sentence_nofrom'];
  const FL_SNAGS = [
    ['form_err_from', ['view_flights'], 'Formulář odmítl: chybí Odkud'],
    ['form_err_range', ['view_flights'], 'Formulář odmítl: rozsah dat'],
    ['form_err_date', ['view_flights'], 'Formulář odmítl: datum'],
    ['form_err_multi', ['view_flights'], 'Formulář odmítl: cesta přes víc měst'],
    ['place_none_from', ['view_flights'], 'Odkud: místo nenalezeno'],
    ['place_none_to', ['view_flights'], 'Kam: místo nenalezeno'],
    ['res_all_hidden', ['search_done'], 'Filtry skryly všechny nabídky'],
    ['search_slow', ['search_done'], 'Hledání vypršelo (pomalý server)'],
    ['api_fail_down', ['app_open'], 'Server neodpovídá'],
    ['sentence_miss', SENTENCES, 'Hledání větou: neznámé místo'],
    ['sentence_nofrom', SENTENCES, 'Hledání větou: chybí odkud'],
  ];
  // Prázdné výsledky a co pak: na co lidi u hledání bez nabídek klepli (na 100 search_empty)
  const FL_FIX = [
    ['fix_date', ['search_empty'], 'Jiné termíny'],
    ['fix_place', ['search_empty'], 'Jiné místo (letiště, země, světadíl)'],
    ['fix_filter', ['search_empty'], 'Zrušit filtr'],
    ['fix_warm', ['search_empty'], 'Snížit teplotu'],
    ['fix_ground', ['search_empty'], 'Vlakem nebo busem'],
  ];
  // Co lidi ve výsledcích zaujalo (na 100 search_done); search_redo = hledání přepsané jiným, ještě než doběhlo
  const FL_RES = [
    ['res_filters', ['search_done'], '⚙️ Filtry otevřené'],
    ['res_sort', ['search_done'], 'Změna řazení'],
    ['res_view_map', ['search_done'], 'Přepnutí na mapu'],
    ['res_view_cal', ['search_done'], 'Přepnutí na kalendář'],
    ['res_best_jump', ['search_done'], 'Skok na nejlevnější'],
    ['search_redo', ['search_done'], 'Nové hledání během hledání'],
    ['sentence_ok', SENTENCES, 'Hledání větou bez potíží'],
    ['buy_age_warn', ['buy_click'], 'Nákup zastavený kvůli staré ceně'],
  ];
  const FL_RANK = { q: 'Kolikátou nabídku v seznamu otevřeli u prodejce (u Kamkoliv a zemí kolikátý cíl)', opts: [['buy_rank_1', '1.'], ['buy_rank_2_5', '2.–5.'], ['buy_rank_6p', '6. a dál']] };
  // Podrobné počty průvodce a Objevuj (Count.deep) posílá jen kdo má zapnuté „Pomáhat se zlepšováním“ – menší vzorek
  // než ostatní čísla. Trychtýř průvodce: [krok, začal znovu na tomto kroku (↺), popisek, počítá se u všech].
  const TRIP_FUNNEL = [
    ['trip_started', '', 'Otevřený průvodce', true],
    ['trip_step_route', 'trip_restart_route', 'Trasa'],
    ['trip_step_stay', 'trip_restart_stay', 'Ubytování'],
    ['trip_step_car', 'trip_restart_car', 'Auto'],
    ['trip_step_program', 'trip_restart_program', 'Program'],
    ['trip_summary', 'trip_restart_summary', 'Shrnutí', true],
    ['trip_saved', '', 'Uložená cesta', true],
  ];
  const TRIP_AUTO = [['trip_auto_done', 'dokončeno'], ['trip_auto_nights', 'skončilo na nocích trasy'], ['trip_auto_stay', 'skončilo na ubytování']];
  // základ ze stejného vzorku (lidé s pomocí), kde to jde: ubytování na 100 příchodů na krok Ubytování
  const TRIP_MORE = [
    ['stay_pick_offer', ['trip_step_stay'], 'Ubytování: Vybrat u nabídky'],
    ['stay_pick_auto', ['trip_step_stay'], 'Ubytování: ✨ Vyber za mě'],
    ['stay_pick_manual', ['trip_step_stay'], 'Ubytování: vlastní cena'],
    ['stay_pick_links', ['trip_step_stay'], 'Ubytování: jen odkazy'],
    ['stay_pick_skip', ['trip_step_stay'], 'Ubytování: neřeším'],
    ['stay_empty_filter', ['trip_step_stay'], 'Filtry skryly všechna ubytování'],
    ['trip_back', ['trip_step_route'], 'Návrat na dřívější krok'],
    ['trip_gap', ['trip_step_route'], 'Doplnění chybějícího kroku ze Shrnutí'],
    ['lazy_fail', ['app_open'], 'Část aplikace se nenačetla'],
  ];
  const EXPLORE = [
    ['place_none_explore', ['view_explore'], 'Hledané místo nenalezeno'],
    ['ex_smart_miss', ['view_explore'], '✨ věta nepochopená'],
    ['ex_smart_ok', ['view_explore'], '✨ věta pochopená'],
    ['ex_empty_list', ['view_explore'], 'Prázdný okruh'],
    ['ex_empty_plan', ['view_explore'], 'Prázdný program'],
    ['ex_empty_trips', ['view_explore'], 'Výlety bez cílů'],
    ['ex_empty_country', ['view_explore'], 'Země bez míst'],
    ['ex_fix', ['view_explore'], 'Náprava prázdného výsledku'],
    ['ex_open_sug', ['view_explore'], 'Místo z návrhů'],
    ['ex_open_enter', ['view_explore'], 'Místo Enterem'],
    ['ex_open_smart', ['view_explore'], 'Místo větou'],
    ['ex_open_other', ['view_explore'], 'Místo jinak (Inspirace, Naposledy, Tady)'],
    ['ex_save', ['view_explore'], 'Uložení do Mých cest'],
    ['ex_fly', ['view_explore'], '✈️ Najít lety sem'],
  ];
  const PERIODS = [7, 30, 90];
  const FEW = 30; // pod 30 odpověďmi rozložení ještě hodně skáče s každou další

  /** Počet události; chybějící (ještě nikdo ji nevyvolal) nebo nesmysl = 0, ne chyba. */
  const num = (counts, e) => {
    const n = Number(counts && Object.prototype.hasOwnProperty.call(counts, e) ? counts[e] : 0);
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
  };

  /** Celé procento části z celku; null, když celek je 0 – „0 %“ by tvrdilo, že nikdo neklepl, i když nic nebylo vidět. */
  const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : null);

  /** Součty za období: total ze serveru, a když chybí, sečtené dny (všechny hodnoty přes num). */
  function totals(stats) {
    const out = {};
    const add = (counts) => { for (const e of Object.keys(counts || {})) out[e] = (out[e] || 0) + num(counts, e); };
    if (stats && stats.total && typeof stats.total === 'object') add(stats.total);
    else for (const d of (stats && Array.isArray(stats.days) ? stats.days : [])) add(d && d.counts);
    return out;
  }

  /**
   * Trychtýř: každý krok s procentem proti předchozímu. Počty jsou události, ne lidé (nikoho nesledujeme) – jeden člověk
   * hledá víckrát, takže procento může přesáhnout 100. Ověření a proklik jsou jeden krok („udělal s cenou něco dál“).
   */
  function funnel(total) {
    const steps = [
      ['Otevření aplikace', num(total, 'app_open')],
      ['Hledání', num(total, 'search_done')],
      ['Ověření nebo proklik', num(total, 'verify_click') + num(total, 'buy_click')],
      ['Průvodce cestou', num(total, 'trip_started')],
      ['Shrnutí', num(total, 'trip_summary')],
      ['Uložená cesta', num(total, 'trip_saved')],
    ];
    return steps.map(([label, n], i) => ({ label, n, pct: i ? pct(n, steps[i - 1][1]) : null }));
  }

  /**
   * Trychtýř průvodce: krok, počet, kolikrát na něm začal znovu (↺) a procento z předchozího kroku – jen mezi kroky ze
   * stejného vzorku (všichni / se zapnutou pomocí), jinak null: porovnání dvou různých skupin by klamalo.
   */
  function tripFunnel(total) {
    return TRIP_FUNNEL.map(([e, re, label, all], i) => {
      const prev = TRIP_FUNNEL[i - 1], n = num(total, e);
      return { e, label, n, all: Boolean(all), restart: re ? num(total, re) : null, pct: prev && Boolean(prev[3]) === Boolean(all) ? pct(n, num(total, prev[0])) : null };
    });
  }

  /**
   * Medián z rozložení odpovědí (hodnoty seřazené vzestupně, [[hodnota, počet]]): prostřední odpověď, u sudého počtu
   * průměr dvou prostředních. null bez odpovědí.
   */
  function median(dist) {
    const sorted = dist.filter(([, n]) => n > 0).sort((a, b) => a[0] - b[0]);
    const n = sorted.reduce((s, [, c]) => s + c, 0);
    if (!n) return null;
    const at = (k) => { // k-tá odpověď (od 1)
      let seen = 0;
      for (const [v, c] of sorted) if ((seen += c) >= k) return v;
      return null;
    };
    return n % 2 ? at((n + 1) / 2) : (at(n / 2) + at(n / 2 + 1)) / 2;
  }

  /** Průzkum ceny Plus: odpovědi s procenty, medián v Kč, podíl ochotných dát aspoň 399 Kč a zda je čísel málo. */
  function survey(total) {
    const options = PRICES.map(([e, value, label]) => ({ e, value, label, n: num(total, e) }));
    const answers = options.reduce((s, o) => s + o.n, 0);
    for (const o of options) o.pct = pct(o.n, answers);
    return {
      options,
      answers,
      median: median(options.map((o) => [o.value, o.n])),
      atLeast399: pct(options.filter((o) => o.value >= 399).reduce((s, o) => s + o.n, 0), answers),
      few: answers < FEW,
    };
  }

  /**
   * Poměry „kde to drhne“: kolik událostí na 100 v základu, seřazené od nejčastější; bez základu nebo se základem 0
   * per100 null (řádek na konci, jen počet). few = základ pod FEW – poměr ještě hodně skáče, na stránce šedě.
   */
  function rates(total, rows = SNAGS) {
    return rows.map(([e, bases, label]) => {
      const base = bases.reduce((s, b) => s + num(total, b), 0);
      const n = num(total, e);
      return { e, label, n, base, per100: bases.length && base > 0 ? Math.round((n / base) * 1000) / 10 : null, few: base < FEW };
    }).sort((a, b) => (b.per100 ?? -1) - (a.per100 ?? -1));
  }

  /** Falešné dveře: zobrazení a klepnutí na každou volbu s procentem ze zobrazení. */
  const doors = (total) => DOORS.map((d) => {
    const shown = num(total, d.shown);
    return { label: d.label, shown, clicks: d.clicks.map(([e, label]) => ({ label, n: num(total, e), pct: pct(num(total, e), shown) })) };
  });

  /** Rozložení odpovědí na jednu otázku z QUESTIONS: každá volba s procentem ze všech odpovědí a zda je jich málo. */
  function dist(total, question) {
    const options = question.opts.map(([e, label]) => ({ e, label, n: num(total, e) }));
    const answers = options.reduce((s, o) => s + o.n, 0);
    for (const o of options) o.pct = pct(o.n, answers);
    return { q: question.q, options, answers, few: answers < FEW };
  }

  /** Řádky tabulky po dnech: nejnovější nahoře (server posílá od nejstaršího), chybějící událost 0. */
  function dayRows(days, events = TABLE.map(([e]) => e)) {
    return (Array.isArray(days) ? days : [])
      .filter((d) => d && /^\d{4}-\d{2}-\d{2}$/.test(d.day))
      .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0))
      .map((d) => ({ day: d.day, values: events.map((e) => num(d.counts, e)) }));
  }

  /** Období z adresy (?dni=7) – jen 7, 30 nebo 90, jinak 30 (výchozí i u /api/stats). */
  const period = (v) => (PERIODS.includes(Number(v)) ? Number(v) : 30);

  /** 12345 → „12 345“ (nezlomitelná mezera jako v aplikaci; nezávisle na jazyku prohlížeče). */
  const fmtNum = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const fmtPct = (p) => (p === null ? '–' : `${p} %`);
  const fmtKc = (v) => (v === null ? '–' : `${fmtNum(Math.round(v))} Kč`);
  /** '2027-01-12' → „út 12. 1.“ – den je v UTC (server/lib/counts.js), proto i den v týdnu z UTC. */
  const fmtDay = (day) => {
    const [y, m, d] = day.split('-').map(Number);
    return `${['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d}. ${m}.`;
  };

  /* ---------- Cesty návštěv (GET api/traces – jen od lidí, kteří zapnuli Pomáhat se zlepšováním) ----------
     Návštěva = [[sekund od začátku, událost], …]. Vyhodnocuje se jen souhrnně – jednotlivé návštěvy stránka neukazuje. */
  const TOP = 10;
  /** Události návštěvy bez opakování hned po sobě (dvakrát Lety za sebou je pro cestu jeden krok). */
  const names = (v) => (Array.isArray(v) ? v : []).map((x) => (Array.isArray(x) ? String(x[1]) : '')).filter((e, i, a) => e && e !== a[i - 1]);
  /** Nejčastější hodnoty: [[klíč, počet, % ze všech]] sestupně, nejvýš TOP. */
  function top(keys) {
    const m = new Map();
    for (const k of keys) if (k) m.set(k, (m.get(k) || 0) + 1);
    const all = keys.filter(Boolean).length;
    return [...m].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, TOP).map(([k, n]) => [k, n, pct(n, all)]);
  }
  /** Kde návštěvy končí: poslední událost. */
  const exits = (visits) => top((visits || []).map((v) => names(v).at(-1)));
  /** Co lidé dělali před odchodem: posledních n událostí (cesta „a → b → c“). */
  const lastSteps = (visits, n = 3) => top((visits || []).map((v) => names(v).slice(-n).join(' → ')));
  /** Nejčastější začátky návštěv: prvních n událostí. */
  const topPaths = (visits, n = 4) => top((visits || []).map((v) => names(v).slice(0, n).join(' → ')));
  /** Co následovalo po události, která splňuje is (např. opakované klepnutí); konec návštěvy = „(odchod)“. */
  function after(visits, is) {
    const out = [];
    for (const v of visits || []) {
      const a = names(v);
      a.forEach((e, i) => { if (is(e)) out.push(a[i + 1] || '(odchod)'); });
    }
    return top(out);
  }
  /** Počet návštěv a medián délky v sekundách (sekundy posledního kroku), bez návštěv null. */
  function visitStats(visits) {
    const len = (visits || []).filter((v) => Array.isArray(v) && v.length).map((v) => Number(v.at(-1)[0]) || 0);
    return { n: len.length, median: len.length ? median(len.map((x) => [x, 1])) : null };
  }

  window.Stats = { MAIN, PRICES, DOORS, VIEWS, TABLE, SNAGS, PERIODS, FEW, num, pct, totals, funnel, rates, median, survey, doors, dayRows, period, fmtNum, fmtPct, fmtKc, fmtDay };
  Object.assign(window.Stats, { QUESTIONS, dist });
  Object.assign(window.Stats, { RAGE, names, top, exits, lastSteps, topPaths, after, visitStats });
  Object.assign(window.Stats, { FL_SNAGS, FL_FIX, FL_RES, FL_RANK });
  Object.assign(window.Stats, { TRIP_FUNNEL, TRIP_AUTO, TRIP_MORE, EXPLORE, tripFunnel });

  /* ---------- vykreslení (jen ve stránce) ---------- */
  const root = typeof document !== 'undefined' && document.getElementById('stats');
  if (!root) return;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const row = (label, value, note = '', cls = '') => `<tr${cls ? ` class="${cls}"` : ''}><th scope="row">${esc(label)}</th><td>${value}</td>${note === null ? '' : `<td class="note">${note}</td>`}</tr>`;
  const section = (title, body, hint = '') => `<section><h2>${esc(title)}</h2>${hint ? `<p class="hint">${hint}</p>` : ''}${body}</section>`;
  const table = (rows) => `<table class="list">${rows.join('')}</table>`;

  function render(stats, days) {
    const total = totals(stats);
    const main = table(MAIN.map(([e, label]) => row(label, fmtNum(num(total, e)), null, e === 'search_anywhere' ? 'sub' : '')));
    const fun = table(funnel(total).map((s, i) => row(s.label, fmtNum(s.n), i ? `${fmtPct(s.pct)} z předchozího` : '')));
    const sv = survey(total);
    const svBody = table(sv.options.map((o) => row(o.label, fmtNum(o.n), fmtPct(o.pct))))
      + `<p>Odpovědí: <b>${fmtNum(sv.answers)}</b>. Medián: <b>${fmtKc(sv.median)}</b>. Aspoň 399 Kč by dalo: <b>${fmtPct(sv.atLeast399)}</b>.</p>`
      + (sv.few ? `<p class="warn">Odpovědí je zatím málo (méně než ${FEW}) – na závěr to nestačí.</p>` : '');
    const doorBody = doors(total).map((d) => `<h3>${esc(d.label)}</h3>`
      + table([row('Zobrazeno', fmtNum(d.shown), ''), ...d.clicks.map((c) => row(c.label, fmtNum(c.n), fmtPct(c.pct)))])).join('')
      + table([row('Stránka Plus otevřená', fmtNum(num(total, 'plus_page')), '')]);
    const answers = QUESTIONS.map((x) => dist(total, x)).map((d) => `<h3>${esc(d.q)}</h3>`
      + table(d.options.map((o) => row(o.label, fmtNum(o.n), fmtPct(o.pct))))
      + `<p>Odpovědí: <b>${fmtNum(d.answers)}</b>.</p>` + (d.few ? `<p class="warn">Málo odpovědí (méně než ${FEW}) – na závěr to nestačí.</p>` : '')).join('');
    const views = table([...VIEWS.map(([e, label]) => row(label, fmtNum(num(total, e)), null)), row('Vzhled Letsi zapnutý', fmtNum(num(total, 'look_letsi')), null)]);
    const snags = table(rates(total).map((r) => row(r.label, r.per100 === null ? fmtNum(r.n) : `${String(r.per100).replace('.', ',')} %`,
      r.per100 === null ? `${fmtNum(r.n)}×` : `${fmtNum(r.n)} z ${fmtNum(r.base)}${r.few ? ' · málo dat' : ''}`, r.few && r.per100 !== null ? 'few' : '')));
    // podrobné počty v Letech: stejné řádky jako Kde to drhne (šedě pod FEW v základu)
    const rateTable = (list) => table(rates(total, list).map((r) => row(r.label, r.per100 === null ? fmtNum(r.n) : `${String(r.per100).replace('.', ',')} %`,
      `${fmtNum(r.n)} z ${fmtNum(r.base)}${r.few ? ' · málo dat' : ''}`, r.few ? 'few' : '')));
    const helpOnly = 'Jen od lidí se zapnutou pomocí „Pomáhat se zlepšováním“ – základ (otevření Letů, hledání) počítají všichni, procento je proto spodní odhad; víc řekne pořadí řádků a změna v čase.';
    const rank = dist(total, FL_RANK);
    const flSnags = `<h3>Lety podrobně</h3><p class="hint">${helpOnly}</p>` + rateTable(FL_SNAGS);
    const flFix = `<h3>Lety</h3>${table([row('Hledání bez nabídek', fmtNum(num(total, 'search_empty')), '')])}` + rateTable(FL_FIX);
    const flRes = `<h3>Lety: výsledky</h3>` + rateTable(FL_RES) + `<h3>${esc(rank.q)}</h3>`
      + table(rank.options.map((o) => row(o.label, fmtNum(o.n), fmtPct(o.pct)))) + (rank.few ? `<p class="warn">Málo nákupů (méně než ${FEW}) – na závěr to nestačí.</p>` : '');
    const rateRows = (list) => table(rates(total, list).map((r) => row(r.label, r.per100 === null ? fmtNum(r.n) : `${String(r.per100).replace('.', ',')} %`,
      r.per100 === null ? `${fmtNum(r.n)}×` : `${fmtNum(r.n)} z ${fmtNum(r.base)}${r.few ? ' · málo dat' : ''}`, r.few && r.per100 !== null ? 'few' : '')));
    const autoN = TRIP_AUTO.reduce((a, [e]) => a + num(total, e), 0);
    const tripFun = table([...tripFunnel(total).map((s) => row(s.label + (s.all ? '' : ' ✓'), fmtNum(s.n),
      [s.pct === null ? '' : `${fmtPct(s.pct)} z předchozího`, s.restart === null ? '' : `↺ znovu ${fmtNum(s.restart)}×`].filter(Boolean).join(' · '))),
      row('⚡ Poskládej', fmtNum(autoN), TRIP_AUTO.map(([e, l]) => `${l} ${fmtNum(num(total, e))}`).join(' · '))]);
    const deepHint = 'Jen lidé, kteří si sami zapnuli „Pomáhat se zlepšováním“ – vzorek je menší než u ostatních čísel.';
    const rows = dayRows(stats && stats.days);
    const daily = rows.length
      ? `<div class="scroll"><table class="days"><thead><tr><th scope="col">Den</th>${TABLE.map(([, l]) => `<th scope="col">${esc(l)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr><th scope="row">${esc(fmtDay(r.day))}</th>${r.values.map((v) => `<td>${fmtNum(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
      : '<p>Za toto období nejsou žádné dny.</p>';
    root.innerHTML = section(`Hlavní čísla za ${days} dní`, main)
      + section('Trychtýř', fun, 'Počty jsou události, ne lidé – jeden člověk hledá i víckrát, procento proto může přesáhnout 100.')
      + section('Kde to drhne', snags + flSnags, `Počty si dělá server sám ze svých odpovědí, procento je z jejich základu: hledání = dokončená hledání, sdílené odkazy = všechna otevření, chyby = otevření aplikace. Hledání bez nabídek počítá server (jen nově spočítaná, ne hotový výsledek z mezipaměti) a dokončená hledání aplikace, poměr je proto přibližný a spíš nižší. Pod ${FEW} v základu šedě (málo dat).`)
      + section('Prázdné výsledky a co pak', flFix, `Na co lidi u hledání bez nabídek klepli, na 100 takových hledání. ${helpOnly}`)
      + section('Co lidi zaujalo', flRes, `Na 100 dokončených hledání. ${helpOnly}`)
      + section('Trychtýř průvodce', tripFun, `${deepHint} Kroky s ✓ a ⚡ jsou jen od nich, ostatní od všech – procento proto jen mezi kroky ze stejné skupiny. ↺ znovu = kolikrát na kroku začal znovu (po potvrzení).`)
      + section('Průvodce – podrobnosti', rateRows(TRIP_MORE), `${deepHint} Ubytování na 100 příchodů na krok Ubytování, návraty na 100 příchodů na Trasu, nenačtení na 100 otevření aplikace (otevření počítáme u všech – poměr je spodní odhad).`)
      + section('Objevuj', rateRows(EXPLORE), `${deepHint} Na 100 návštěv Objevuj – návštěvy počítáme u všech, poměr je proto spodní odhad. Opuštěné hledání se zatím nepočítá.`)
      + section('Kolik by dali za Plus', svBody)
      + section('Zájem o Plus', doorBody, 'Procento = klepnutí ze zobrazení.')
      + section('Návštěvy sekcí', views)
      + section('Odpovědi na otázky', answers, 'Krátké otázky v aplikaci (odpověď jedním klepnutím). Kolikrát se otázka ukázala, se nepočítá – procento je ze všech odpovědí.')
      + section('Po dnech', daily, 'Dny podle UTC, nejnovější nahoře. Otevř. = otevření, Hled. = hledání, Ověř. = ověření ceny, Prokl. = proklik k prodejci, Prův. = průvodce, Ulož. = uložená cesta.');
  }

  // názvy událostí v cestách česky podle tabulek výše (jinak syrový název)
  const LABELS = new Map([...MAIN, ...VIEWS, ...SNAGS.map(([e, , l]) => [e, l]), ...RAGE.map(([e, l]) => [e, `Opakované klepnutí – ${l}`])]);
  const lbl = (path) => path.split(' → ').map((e) => LABELS.get(e) || e).join(' → ');
  const fmtSec = (s) => (s === null ? '–' : s < 90 ? `${Math.round(s)} s` : `${Math.round(s / 60)} min`);
  function renderTraces(box, data, total) {
    const visits = (data && Array.isArray(data.visits)) ? data.visits : [];
    const vs = visitStats(visits);
    const list = (rows) => (rows.length ? table(rows.map(([k, n, p]) => row(lbl(k), fmtNum(n), fmtPct(p)))) : '<p>Zatím žádné návštěvy.</p>');
    const rage = table(RAGE.map(([e, l]) => row(l, fmtNum(num(total, e)), null)));
    box.innerHTML = section('Cesty návštěv', `<p>Návštěv: <b>${fmtNum(vs.n)}</b>. Medián délky: <b>${fmtSec(vs.median)}</b>.</p>`
      + (vs.n < FEW ? `<p class="warn">Návštěv je zatím málo (méně než ${FEW}) – na závěr to nestačí.</p>` : '')
      + '<h3>Kde návštěvy končí</h3>' + list(exits(visits))
      + '<h3>Co dělali před odchodem</h3>' + list(lastSteps(visits, 3))
      + '<h3>Jak návštěvy začínají</h3>' + list(topPaths(visits, 4))
      + '<h3>Co následovalo po opakovaném klepnutí</h3>' + list(after(visits, (e) => e.startsWith('rage_')))
      + '<h3>Opakované klepnutí podle sekce</h3>' + rage,
    `Jen od lidí, kteří v aplikaci sami zapnuli Pomáhat se zlepšováním, za posledních ${data && data.days ? data.days : '–'} dní (záznamy se mažou do 31 dnů). Jen souhrny – jednotlivé návštěvy se neukazují. Procento je ze všech návštěv, po opakovaném klepnutí ze všech opakovaných klepnutí.`);
  }
  /** Cesty návštěv pod statistikami: stejný klíč, období 7–30 dní (déle se záznamy nedrží). */
  async function loadTraces(days, total, id) {
    const box = document.getElementById('traces');
    if (!box) return;
    let data = null, status = 0;
    try {
      const r = await fetch(`api/traces?days=${Math.min(30, Math.max(7, days))}`, { credentials: 'omit', headers: key ? { Authorization: `Bearer ${key}` } : {} });
      status = r.status;
      if (r.ok) data = await r.json();
    } catch (e) { /* bez sítě jako 503 */ }
    if (id !== asked) return;
    if (data) renderTraces(box, data, total);
    else box.innerHTML = status === 404 ? section('Cesty návštěv', '<p>Záznam návštěv je dostupný jen s nastaveným klíčem STATS_KEY na serveru.</p>') : status === 401 ? '' : section('Cesty návštěv', '<p class="warn">Záznamy teď nejsou dostupné.</p>');
  }

  const buttons = document.querySelectorAll('[data-days]');
  let asked = 0; // pořadí dotazu: pomalá starší odpověď nepřepíše novější období
  let key = ''; // klíč ke statistikám jen v paměti stránky – po zavření zmizí, pamatuje si ho správce hesel
  let shown = 30;

  /** Server chce klíč (401): pole hesla, napodruhé (klíč byl, ale nesedí) s větou „Klíč nesedí.“. */
  function askKey(wrong) {
    root.innerHTML = `<form id="statsKeyForm" class="key"><label for="statsKey">Klíč ke statistikám</label>
      <input id="statsKey" name="password" type="password" autocomplete="current-password" required>
      <button type="submit">Ukázat statistiky</button>${wrong ? '<p class="warn" role="alert">Klíč nesedí.</p>' : ''}</form>`;
    const form = document.getElementById('statsKeyForm');
    if (!form) return;
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      key = document.getElementById('statsKey').value.trim();
      if (key) load(shown);
    });
    if (!wrong) document.getElementById('statsKey').focus();
  }

  async function load(days) {
    const id = ++asked;
    shown = days;
    for (const b of buttons) b.setAttribute('aria-pressed', String(Number(b.dataset.days) === days));
    root.setAttribute('aria-busy', 'true');
    let stats = null, locked = false;
    try {
      const r = await fetch(`api/stats?days=${days}`, { credentials: 'omit', headers: key ? { Authorization: `Bearer ${key}` } : {} });
      if (r.status === 401) locked = true;
      else if (r.ok) stats = await r.json();
    } catch (e) { /* bez sítě stejně jako 503 */ }
    if (id !== asked) return;
    root.removeAttribute('aria-busy');
    if (locked) {
      askKey(Boolean(key));
      key = '';
    } else if (stats && typeof stats === 'object') {
      render(stats, days);
      loadTraces(days, totals(stats), id);
    }
    else root.innerHTML = '<p class="warn">Počty teď nejsou dostupné.</p>';
  }
  for (const b of buttons) {
    b.addEventListener('click', () => {
      const days = period(b.dataset.days);
      // období v adrese: obnovení stránky nebo uložená záložka ukáže totéž
      try { history.replaceState(null, '', `?dni=${days}`); } catch (e) { /* jen pohodlí */ }
      load(days);
    });
  }
  load(period(new URLSearchParams(location.search).get('dni')));
})();
