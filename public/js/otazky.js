/* Letsi – testovací verze a krátké otázky testerům. Aplikace je zatím zdarma a testovací: značka „Testovací verze“
   s odkazem „Napiš, co ti vadí“ (e-mail na FEEDBACK_EMAIL z /api/health) je stálé místo pro zpětnou vazbu – v okně
   Další (app.js openMore) a na počítači v postranním panelu. Bez adresy na serveru jen značka, výzva se schová.
   Krátké otázky: karta na Přehledu (#askCard, app.js renderDash) – Přehled je místo mezi úkoly, takže otázka nikdy
   nepřijde uprostřed hledání nebo psaní. Nejvýš jedna otázka denně, zodpovězená se nevrátí, „Teď ne“ ji pro dnešek
   zavře a každá se ukáže nejvýš ve 2 dnech. Odpověď (pevný název mq_*) jde stejnou cestou jako průzkum ceny Plus:
   Count.hit → souhrnný denní počet bez vazby na člověka (počítá se i bez souhlasu s podrobným měřením, jako ostatní
   krátké otázky; do záznamu návštěvy nejde – count.js skipStep). Volný text („Jiné – napiš“) server neukládá:
   nabídne se e-mail s předvyplněnou otázkou a odpovědí, a jen když je FEEDBACK_EMAIL nastavený.
   V zařízení se ukládá jen localStorage.atlas_ask (počet dní s návštěvou, den a id ukázané otázky, které otázky
   jsou zodpovězené a v kolika dnech se ukázaly) – samotné odpovědi ne. Logika je v čistých funkcích
   (test/zpetna-vazba.test.js). */
(function () {
  const KEY = 'atlas_ask';
  const MAX_DAYS = 2; // v kolika dnech se jedna otázka nejvýš ukáže, když na ni nikdo neodpoví
  // Pořadí = přednost. Volba končící _other je „Jiné – napiš“: jen s FEEDBACK_EMAIL, otevře e-mail.
  const QS = [
    // po hledání (S.recent – dokončené hledání), při další návštěvě Přehledu
    { id: 'found', q: 'Našel jsi, co jsi hledal?',
      opts: [['mq_found_yes', 'Ano'], ['mq_found_almost', 'Skoro – chyběl termín nebo letiště'], ['mq_found_no', 'Ne'], ['mq_found_price', 'Nerozumím cenám'], ['jine_found_other', 'Jiné – napiš']] },
    // po naplánované cestě (průvodce došel do Shrnutí, nebo cestu z průvodce sám uložil)
    { id: 'miss', q: 'Co ti v průvodci nejvíc chybělo?',
      opts: [['mq_miss_stay', 'Ceny ubytování'], ['mq_miss_prog', 'Víc tipů na program'], ['mq_miss_ground', 'Doprava na místě'], ['mq_miss_none', 'Nic, bylo to dobré'], ['jine_miss_other', 'Jiné – napiš']] },
    // od 3. dne s návštěvou
    { id: 'back', q: 'Co tě sem vrací?',
      opts: [['mq_back_cheap', 'Levné letenky'], ['mq_back_plan', 'Plánuju konkrétní cestu'], ['mq_back_idea', 'Hledám, kam vyrazit'], ['mq_back_try', 'Jen zkouším'], ['jine_back_other', 'Jiné – napiš']] },
  ];
  const isOther = e => /_other$/.test(e);
  const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- čistá logika (stav st = obsah atlas_ask) ---------- */
  const clean = st => (st && typeof st === 'object' && !Array.isArray(st) ? st : {});
  /** Další den s návštěvou → v (počet dní) + 1; tentýž den beze změny. */
  function visit(st, day) {
    st = clean(st);
    return st.vd === day ? st : { ...st, v: (+st.v || 0) + 1, vd: day };
  }
  const isDone = (st, id) => Array.isArray(st.done) && st.done.includes(id);
  const daysShown = (st, id) => (st.n && +st.n[id]) || 0;
  /**
   * Kterou otázku dnes ukázat (id), nebo null. ctx = { busy (hledá se, píše se, jiná prosba na Přehledu – nic),
   * search (už proběhlo hledání), trip (naplánovaná cesta) }. Dnes už ukázaná otázka se vrací, dokud na ni člověk
   * neodpoví nebo ji nezavře; jiná dnes nepřijde.
   */
  function pick(st, ctx, day) {
    st = clean(st);
    if (!ctx || ctx.busy) return null;
    if (st.day === day) return st.cur && !isDone(st, st.cur) ? st.cur : null;
    const want = { found: ctx.search, miss: ctx.trip, back: (+st.v || 0) >= 3 };
    const q = QS.find(x => want[x.id] && !isDone(st, x.id) && daysShown(st, x.id) < MAX_DAYS);
    return q ? q.id : null;
  }
  /** Otázka id je dnes vidět: první ukázání v daný den se počítá do MAX_DAYS. */
  function shown(st, id, day) {
    st = clean(st);
    if (st.day === day && st.cur === id) return st;
    return { ...st, day, cur: id, n: { ...(st.n || {}), [id]: daysShown(st, id) + 1 } };
  }
  /** Odpověď: otázka se už nikdy nevrátí. */
  const answer = (st, id) => { st = clean(st); return { ...st, cur: null, done: [...new Set([...(Array.isArray(st.done) ? st.done : []), id])] }; };
  /** „Teď ne“: dnes už žádná otázka. */
  const later = (st, day) => ({ ...clean(st), day, cur: null });

  /** Tělo e-mailu k odpovědi: otázka a zvolená možnost, ať je jasné, k čemu se píše. */
  const mailBody = (q, label) => `Otázka: ${q}\nOdpověď: ${label}\n\n`;

  /** Obsah karty (čistá funkce): volby, „Jiné – napiš“ jen s e-mailem, „Teď ne“; role=status už předem (čtečka). */
  function cardHtml(id, email) {
    const q = QS.find(x => x.id === id);
    if (!q) return '';
    const opts = q.opts.filter(([e]) => email || !isOther(e));
    return `<div class="dt-b ask-b"><span class="ask-k">Testovací verze – krátká otázka</span>
      <b class="ask-q" id="askQ">${h(q.q)}</b>
      <div class="row wrap ask-o" role="group" aria-labelledby="askQ">${opts.map(([e, l]) => `<button type="button" class="fchip" data-ask="${h(e)}">${h(l)}</button>`).join('')}</div>
      <button type="button" class="linkbtn ask-no" id="askNo">Teď ne</button><span class="ask-st" role="status"></span></div>`;
  }

  /* ---------- v prohlížeči ---------- */
  const store = {
    get() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } },
    set(st) { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* soukromé okno – zeptá se příště znovu */ } },
  };
  const today = () => (typeof todayLocal === 'function' ? todayLocal() : new Date().toISOString().slice(0, 10));
  const version = () => (typeof WN_ID !== 'undefined' ? WN_ID : '');
  /** FEEDBACK_EMAIL z /api/health (stejný dotaz, který app.js stahuje při startu); bez serveru null. */
  const email = () => (window.Flights && Flights.warm ? Promise.resolve(Flights.warm()).then(hl => (hl && hl.feedback && hl.feedback.email) || null, () => null) : Promise.resolve(null));
  const mailto = (to, screen, body) => (window.About && About.mailto ? About.mailto(to, version(), screen, body) : null);

  /** Odkaz „Napiš, co ti vadí“ (el = <a hidden>): ukáže se jen s platnou adresou. */
  function fillLink(a, screen) {
    if (!a) return;
    email().then(to => { const href = to && mailto(to, screen); if (href) { a.href = href; a.hidden = false; } });
  }
  const badge = id => `<span class="test-tag">Testovací verze</span> <a class="test-fb" id="${id}" hidden>Napiš, co ti vadí</a>`;
  /** Značka v okně Další (app.js openMore) hned pod nadpisem. */
  function addToMenu(m) {
    const h3 = m && m.querySelector('h3');
    if (!h3) return;
    h3.insertAdjacentHTML('afterend', `<p class="test-line">${badge('moreFb')}</p>`);
    const t = document.querySelector('#pageTitle');
    fillLink(m.querySelector('#moreFb'), t ? t.textContent.trim() : '');
  }

  let picked = null; // otázka vybraná při posledním vykreslení Přehledu (karta se ukáže až po /api/health)
  let held = false; // karta už zabrala místo pro otázku na téhle stránce (Count.holdAsk)
  /** Karta s otázkou na Přehledu (el = #askCard); busy = jiná prosba na Přehledu (uvítání, souhlas s měřením). */
  function render(el, busy) {
    if (!el) return;
    const day = today();
    let st = visit(store.get(), day);
    const typing = document.activeElement && document.activeElement.matches && document.activeElement.matches('input, textarea, select, [contenteditable]');
    const searching = Boolean(window.Flights && Flights.busy && Flights.busy());
    // na téhle stránce už padla jiná krátká otázka (Count.ask ve výsledcích nebo ve Shrnutí) – dnes už ne
    const asked = Boolean(!held && window.Count && Count.askedNow && Count.askedNow());
    const trip = (S.trip && S.trip.step === 'summary' && !S.trip.shared) || (S.trips || []).some(t => t && t.tripId && !t.auto && !t.shared);
    const id = pick(st, { busy: busy || typing || searching || asked, search: (S.recent || []).length > 0, trip }, day);
    store.set(st);
    el.hidden = true; el.innerHTML = '';
    const tok = render.tok = (render.tok || 0) + 1;
    picked = id;
    if (!id) return;
    // karta až s odpovědí /api/health (jinak by „Jiné – napiš“ přibylo pod rukou); většinou už je stažená
    email().then(to => {
      if (tok !== render.tok || !el.isConnected) return; // mezitím se Přehled překreslil
      st = shown(store.get() || st, id, day);
      store.set(st);
      if (window.Count && Count.holdAsk) { Count.holdAsk(); held = true; }
      const q = QS.find(x => x.id === id);
      el.innerHTML = cardHtml(id, to);
      el.hidden = false;
      el.querySelectorAll('[data-ask]').forEach(b => b.onclick = () => {
        const e = b.dataset.ask, label = b.textContent;
        if (window.Count && !isOther(e)) Count.hit(e); // „Jiné“ se nepočítá – strop událostí (counts.js), text chodí e-mailem
        store.set(answer(store.get() || st, id));
        // díky a nabídka dopsat víc e-mailem (u „Jiné“ hlavní věc); fokus na poděkování, tlačítko s ním zmizelo
        const href = to && mailto(to, 'krátká otázka', mailBody(q.q, isOther(e) ? 'Jiné' : label));
        const stEl = el.querySelector('.ask-st');
        el.querySelectorAll('.ask-o, .ask-no').forEach(x => x.remove());
        stEl.innerHTML = `Díky!${href ? ` <a href="${h(href)}">${isOther(e) ? 'Napiš mi to e-mailem' : 'Chceš něco dodat? Napiš mi'}</a>` : ''}`;
        stEl.tabIndex = -1;
        picked = null;
        stEl.focus({ preventScroll: true });
      });
      el.querySelector('#askNo').onclick = () => { store.set(later(store.get() || st, day)); picked = null; el.hidden = true; el.innerHTML = ''; };
    });
  }

  // Počítač a tablet: značka v postranním panelu nad řadou tlačítek (na telefonu je panel skrytý). V node testu DOM není.
  if (typeof document !== 'undefined') {
    const tools = document.querySelector('.side-foot .side-tools');
    if (tools && !document.querySelector('#sideFb')) {
      tools.insertAdjacentHTML('beforebegin', `<p class="test-line side-test">${badge('sideFb')}</p>`);
      fillLink(document.querySelector('#sideFb'), '');
    }
  }

  window.Otazky = { QS, visit, pick, shown, answer, later, mailBody, cardHtml, addToMenu, render, pending: () => Boolean(picked) };
})();
