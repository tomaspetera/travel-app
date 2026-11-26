/* ATLAS – stránka Statistiky pro majitele (public/statistiky.html): čitelný přehled souhrnných počtů z GET api/stats
   (server/lib/counts.js) na telefonu místo syrového JSON. Jen čte veřejné denní součty – nic neposílá ani neukládá.
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

  /** Falešné dveře: zobrazení a klepnutí na každou volbu s procentem ze zobrazení. */
  const doors = (total) => DOORS.map((d) => {
    const shown = num(total, d.shown);
    return { label: d.label, shown, clicks: d.clicks.map(([e, label]) => ({ label, n: num(total, e), pct: pct(num(total, e), shown) })) };
  });

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

  window.Stats = { MAIN, PRICES, DOORS, VIEWS, TABLE, PERIODS, FEW, num, pct, totals, funnel, median, survey, doors, dayRows, period, fmtNum, fmtPct, fmtKc, fmtDay };

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
    const views = table([...VIEWS.map(([e, label]) => row(label, fmtNum(num(total, e)), null)), row('Vzhled Letsi zapnutý', fmtNum(num(total, 'look_letsi')), null)]);
    const rows = dayRows(stats && stats.days);
    const daily = rows.length
      ? `<div class="scroll"><table class="days"><thead><tr><th scope="col">Den</th>${TABLE.map(([, l]) => `<th scope="col">${esc(l)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr><th scope="row">${esc(fmtDay(r.day))}</th>${r.values.map((v) => `<td>${fmtNum(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
      : '<p>Za toto období nejsou žádné dny.</p>';
    root.innerHTML = section(`Hlavní čísla za ${days} dní`, main)
      + section('Trychtýř', fun, 'Počty jsou události, ne lidé – jeden člověk hledá i víckrát, procento proto může přesáhnout 100.')
      + section('Kolik by dali za Plus', svBody)
      + section('Zájem o Plus', doorBody, 'Procento = klepnutí ze zobrazení.')
      + section('Návštěvy sekcí', views)
      + section('Po dnech', daily, 'Dny podle UTC, nejnovější nahoře. Otevř. = otevření, Hled. = hledání, Ověř. = ověření ceny, Prokl. = proklik k prodejci, Prův. = průvodce, Ulož. = uložená cesta.');
  }

  const buttons = document.querySelectorAll('[data-days]');
  let asked = 0; // pořadí dotazu: pomalá starší odpověď nepřepíše novější období
  async function load(days) {
    const id = ++asked;
    for (const b of buttons) b.setAttribute('aria-pressed', String(Number(b.dataset.days) === days));
    root.setAttribute('aria-busy', 'true');
    let stats = null;
    try {
      const r = await fetch(`api/stats?days=${days}`, { credentials: 'omit' });
      if (r.ok) stats = await r.json();
    } catch (e) { /* bez sítě stejně jako 503 */ }
    if (id !== asked) return;
    root.removeAttribute('aria-busy');
    if (stats && typeof stats === 'object') render(stats, days);
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
