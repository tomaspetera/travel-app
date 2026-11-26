/* ATLAS – ⭐ nabídka placené verze jako „falešné dveře“: stránka Zdarma × Plus, list při druhé cestě, Sešit cesty,
   karta 14 dní před odletem a otázka, kolik by Plus stálo za rok. Platby zatím neběží – nic se nezamyká ani nemaže
   bez výslovného potvrzení, každé tlačítko poctivě řekne, že Plus teprve chystáme. Co lidé zvolí, se počítá jen
   souhrnně (Count.hit, události ze seznamu EVENTS v server/lib/counts.js). Do prohlížeče se ukládá jen den poslední
   otázky na cenu a skryté karty sešitu – žádný identifikátor. Čisté funkce (bez DOM) testuje test/plus.test.js. */
(function () {
  // název placené verze na jednom místě – při přejmenování na Letsi se mění jen tady
  const NAME = 'ATLAS Plus';
  const YEAR_CZK = 399, MONTH_CZK = 149;
  const PRICES = [0, 199, 399, 599, 799];
  const ASK_DAYS = 30; // otázka na cenu nejvýš jednou za 30 dní
  const CARD_DAYS = 14; // karta sešitu na Přehledu nejdřív 14 dní před odletem
  const ASK_KEY = 'atlas_price_q', CARD_KEY = 'atlas_sesit_card';
  const SOON = 'chystáme na jaro';

  const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isYmd = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const dayMs = s => Date.parse(s + 'T12:00:00Z');
  const daysFrom = (a, b) => Math.round((dayMs(b) - dayMs(a)) / 864e5);
  const ymd = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const hit = e => { if (window.Count) window.Count.hit(e); };
  const kc = n => `${n} Kč`;

  /* ---------- čisté funkce ---------- */
  // Cesta od jiného (přijatá odkazem): nese otisk přijaté verze (gotVer, u starších odkazů sharedSnap), ale nikdy
  // neodešla ode mě (sentSnaps má jen cesta, kterou jsem sám sdílel).
  const fromOther = t => Boolean((t.gotVer || t.sharedSnap) && !t.sentSnaps);
  // Cesta z Objevuj (places.js): má uložený program Objevuj a není z průvodce. Program z Objevuj přidaný k cestě
  // z průvodce (stejné místo a začátek) z ní cestu z Objevuj nedělá.
  const fromExplore = t => Boolean(t.explore && !t.tripId);
  /**
   * Počítá se cesta do „jedné cesty zdarma“? Ano: rozpracovaná nebo budoucí (návrat dnes a později, nebo bez data).
   * Ne: proběhlá, z Objevuj, od jiného a sama uložená rozpracovaná cesta z průvodce (auto: true). Tu průvodce ukládá
   * potichu, jakmile se pokročí za výběr letu, a ↺ Začít znovu nebo nová cesta ji bez ptaní zase odeberou – člověk ji
   * vědomě neuložil, list by mu jinak připomínal cestu, o které neví. Počítat se začne, až ji uloží sám (💾).
   */
  function counts(t, today) {
    if (!t || typeof t !== 'object' || t.auto || fromExplore(t) || fromOther(t)) return false;
    const last = isYmd(t.end) ? t.end : t.start;
    return !isYmd(last) || last >= today;
  }
  /** Započítané cesty, nejbližší první (bez data na konci). */
  function countedTrips(trips, today) {
    const at = t => (isYmd(t.start) ? t.start : '9999');
    return (Array.isArray(trips) ? trips : []).filter(t => counts(t, today)).sort((a, b) => at(a).localeCompare(at(b)));
  }
  /** Ukázat list „Místo pro jednu cestu máš obsazené“: nová cesta by se počítala a jedna započítaná už je. */
  function needsGate(trips, newTrip, today) {
    if (newTrip && !counts(newTrip, today)) return false;
    return countedTrips(trips, today).length > 0;
  }
  /** Zeptat se na cenu? Poprvé ano, pak až po 30 dnech (den v budoucnu = posunuté hodiny → zeptat se). */
  function askDue(last, today) {
    if (!isYmd(last)) return true;
    const d = daysFrom(last, today);
    return d >= ASK_DAYS || d < 0;
  }
  const tripKey = t => String(t.tripId || `${t.name || ''}|${t.start || ''}`);
  /**
   * Karta „Vezmi si cestu s sebou“ na Přehledu: nejbližší uložená cesta s odletem za 1–14 dní (ne v den odletu ani
   * během cesty), kterou člověk nezavřel (hidden = klíče tripKey). Cesta od jiného a sama uložená rozpracovaná ne.
   * → { trip, days } nebo null.
   */
  function cardPick(trips, today, hidden = []) {
    let best = null;
    for (const t of Array.isArray(trips) ? trips : []) {
      if (!t || t.auto || fromOther(t) || !isYmd(t.start) || hidden.includes(tripKey(t))) continue;
      const d = daysFrom(today, t.start);
      if (d >= 1 && d <= CARD_DAYS && (!best || d < best.days)) best = { trip: t, days: d };
    }
    return best;
  }
  const inDays = d => (d === 1 ? 'Zítra' : `Za ${d} ${d <= 4 ? 'dny' : 'dní'}`);
  /** Věta karty. gen = cíl ve 2. pádě (app.js doGen), když jde jistě vyskloňovat – jinak věta s cílem v 1. pádě. */
  function cardText(pick, gen) {
    const t = pick.trip, go = t.ground ? 'jedeš' : 'letíš', dest = placeOf(t);
    return `${inDays(pick.days)} ${gen ? `${go} do ${gen}` : `tě čeká ${dest}`}. Vezmi si cestu s sebou – sešit k tisku i do telefonu.`;
  }
  // název cesty pro člověka: u cesty z průvodce cíl (název nese i datum), jinak název, který si dal
  const placeOf = t => String((t.tripId ? t.dest : t.name || t.dest) || 'cesta').trim();
  const dm = s => `${+s.slice(8, 10)}. ${+s.slice(5, 7)}.`;
  /** Termín cesty krátce: „3.–10. 5.“, „28. 4.–3. 5.“, „od 3. 5.“, bez data „bez termínu“. */
  function termTxt(t) {
    const a = isYmd(t.start) ? t.start : '', b = isYmd(t.end) ? t.end : '';
    if (!a) return 'bez termínu';
    if (!b || b === a) return a === b ? dm(a) : `od ${dm(a)}`;
    return a.slice(0, 7) === b.slice(0, 7) ? `${+a.slice(8, 10)}.–${dm(b)}` : `${dm(a)}–${dm(b)}`;
  }
  /** Věta okna sešitu; gen jako u cardText, country = název země v 1. pádě (nebo ''). */
  function sesitLine(dest, country, gen) {
    const what = gen ? `Celá cesta do ${gen}` : dest;
    const land = country && country !== dest ? `co platí v zemi ${country}` : 'počasí';
    return `${what} v jednom souboru: den po dni s časy, adresy, co zařídit a ${land} pro tvůj termín. K tisku i do telefonu, pro celou partu.`;
  }

  /**
   * Průběh listu limitu bez DOM (io = obsluha okna, testy dosadí vlastní). Pravidla: nic se nezablokuje – proceed()
   * se zavolá vždy (volba, zavření listu bez volby, zrušené potvrzení a pak zavření), právě jednou; maže se jen
   * po potvrzeném Nahradit, a to až po uložení nové cesty. proceed(true) = list byl vidět, volající už nikam
   * nepřechází (list mohl nechat otevřenou otázku na cenu). → null (list netřeba, proceed(false) už proběhlo)
   * nebo { cur, choose(volba), closed() }.
   */
  function gateFlow(trips, newTrip, today, io) {
    if (!needsGate(trips, newTrip, today)) { io.proceed(false); return null; }
    const cur = countedTrips(trips, today)[0], name = placeOf(cur);
    let done = false;
    const go = () => { if (!done) { done = true; io.proceed(true); } };
    io.show(sheetHtml(cur));
    io.hit('limit_shown');
    return {
      cur,
      choose(c) {
        if (done) return;
        if (c === 'plus') { io.hit('limit_plus'); go(); io.thanks(); }
        else if (c === 'download') { io.hit('limit_download'); io.download(); io.close(); go(); }
        else if (c === 'replace') {
          io.hit('limit_replace');
          if (!io.confirm(`Smazat cestu „${name}“ z Mých cest? Nová cesta se uloží místo ní.`)) return;
          io.close(); go(); io.remove(cur);
        }
      },
      closed: go,
    };
  }

  /* ---------- HTML ---------- */
  function sheetHtml(cur) {
    const name = h(placeOf(cur)), term = termTxt(cur);
    return `<div class="modal-body plus-sheet">
      <h3>Místo pro jednu cestu máš obsazené</h3>
      <p>Zdarma si tu držíš jednu cestu – teď <b>${name}</b> ${h(term)}${term.endsWith('.') ? '' : '.'}</p>
      <div class="plus-acts">
        <button type="button" class="btn primary" data-pl="plus">Nechat si obě · Plus ${kc(YEAR_CZK)} na rok</button>
        <button type="button" class="btn" data-pl="download">Stáhnout ${name} do souboru a začít novou</button>
        <button type="button" class="btn ghost" data-pl="replace">Nahradit ${name} novou cestou</button>
      </div>
      <p class="faint plus-small">Nebo ${kc(MONTH_CZK)} na měsíc. Obnovení vypneš jedním klepnutím.</p>
    </div>`;
  }
  const priceHtml = () => `<div class="plus-price" id="plusPrice"><b>Kolik by ti Plus stálo za rok?</b>
    <div class="plus-opts">${PRICES.map(p => `<button type="button" class="btn sm" data-price="${p}">${p ? kc(p) : 'Nic, stačí mi zdarma'}</button>`).join('')}</div></div>`;
  const FREE = [
    ['Hledání letenek a orientační ceny', 'ano', 'ano'],
    ['Ověření ceny u prodejce', 'ano', 'ano'],
    ['Informace o zemích a Objevuj', 'ano', 'ano'],
    ['Plánovaná cesta celá (i ⚡ Poskládej celou cestu)', 'jedna', 'neomezeně'],
    ['Záloha do souboru', 'ano', 'ano'],
    ['Sdílení cesty', 'ano', 'ano'],
    ['Archiv minulých cest', 'ne', 'ano'],
    ['Sešit cesty k tisku a do PDF', 'ne', 'ano'],
  ];
  const cell = v => (v === 'ano' ? '<span aria-hidden="true">✓</span><span class="sr-only">ano</span>' : v === 'ne' ? '<span aria-hidden="true">–</span><span class="sr-only">ne</span>' : h(v));
  function pageHtml() {
    return `<div class="modal-body plus-page">
      <h3>⭐ ${h(NAME)}</h3>
      <p>Co zůstane zdarma a co chystáme navíc.</p>
      <table class="plus-table"><thead><tr><th scope="col">Co</th><th scope="col">Zdarma</th><th scope="col">Plus <small>${SOON}</small></th></tr></thead>
        <tbody>${FREE.map(([what, a, b]) => `<tr><th scope="row">${h(what)}</th><td>${cell(a)}</td><td>${cell(b)}</td></tr>`).join('')}</tbody></table>
      <p class="plus-small">Plus: ${kc(YEAR_CZK)} na rok, nebo ${kc(MONTH_CZK)} na měsíc.</p>
      <p class="faint plus-small">Z čeho ATLAS žije: z provizí partnerů, z předplatného Plus a z dobrovolných příspěvků. Reklamu neprodáváme a pořadí výsledků si nikdo nekoupí.</p>
      <div id="plusAfter"><button type="button" class="btn primary block" id="plusWant">Chci Plus</button></div>
    </div>`;
  }
  /** Náhled sešitu z dat cesty (titul, termín, první dva dny programu) – žádný obrázek. */
  function sesitHtml(t, line) {
    const days = Object.keys(t.days && typeof t.days === 'object' ? t.days : {}).filter(d => isYmd(d) && Array.isArray(t.days[d]) && t.days[d].length).sort().slice(0, 2);
    const dayHtml = days.length ? days.map((d, i) => `<div class="ss-day"><b>Den ${i + 1} · ${dm(d)}</b><ul>${t.days[d].slice(0, 4).map(x => `<li>${h(x)}</li>`).join('')}</ul></div>`).join('')
      : '<p class="faint">Program po dnech doplní průvodce cestou.</p>';
    return `<div class="modal-body plus-page">
      <h3>📒 Sešit cesty</h3>
      <div class="ss-prev" aria-label="Náhled sešitu"><div class="ss-title">${h(placeOf(t))}</div><div class="faint ss-term">${h(termTxt(t))}</div>${dayHtml}</div>
      <p>${h(line)}</p>
      <div id="plusAfter"><button type="button" class="btn primary block" id="sesitWant">Chci sešit</button></div>
    </div>`;
  }

  /* ---------- prohlížeč ---------- */
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* soukromé okno – zeptá se příště znovu */ } },
  };
  const q = s => document.querySelector(s);
  const genOf = s => (typeof doGen === 'function' ? doGen(s) : null);
  const countryOf = iso => (typeof byIso !== 'undefined' && iso && byIso[iso] ? byIso[iso].cs : '');

  /** Do el (v otevřeném okně) zprávu a pod ni otázku na cenu, je-li čas se zeptat. */
  function after(el, msg) {
    if (!el) return;
    const today = ymd(), ask = askDue(store.get(ASK_KEY), today);
    el.innerHTML = `<p class="note info plus-msg">${h(msg)}</p>${ask ? priceHtml() : ''}`;
    if (!ask) return;
    store.set(ASK_KEY, today); // jen den – podle něj se za 30 dní zeptá znovu
    el.querySelectorAll('[data-price]').forEach(b => { b.onclick = () => {
      hit(`price_${b.dataset.price}`);
      const box = el.querySelector('#plusPrice');
      if (box) box.innerHTML = '<p class="plus-thanks">Díky, pomůže nám to nastavit cenu férově.</p>';
    }; });
  }

  /** Stránka ⭐ Plus (okno): tabulka Zdarma × Plus a „Chci Plus“. */
  function open() {
    modalOpen(pageHtml());
    hit('plus_page'); hit('plus_offer_shown');
    q('#plusWant').onclick = () => { hit('plus_offer_click'); after(q('#plusAfter'), 'Plus chystáme na jaro – dáme vědět tady v aplikaci.'); };
  }
  /** Okno Sešitu cesty pro uloženou cestu (záznam z Mých cest nebo stejná pole: name, dest, iso, start, end, days). */
  function sesit(t) {
    if (!t) return;
    const dest = placeOf(t);
    modalOpen(sesitHtml(t, sesitLine(dest, countryOf(t.iso), genOf(dest))));
    q('#sesitWant').onclick = () => { hit('sesit_click'); after(q('#plusAfter'), 'Sešit chystáme na jaro – dáme vědět tady v aplikaci.'); };
  }
  const sesitSeen = new Set();
  /** Tlačítko 📒 Sešit cesty ve Shrnutí bylo vidět – počítá se jednou za otevření aplikace pro danou cestu. */
  function sesitShown(id) {
    if (sesitSeen.has(id)) return;
    sesitSeen.add(id); hit('sesit_shown');
  }

  /**
   * Před vznikem nové cesty, kterou člověk vědomě ukládá (kind: 'form' | 'trip' | 'offer' – odkud). newTrip = nová
   * cesta (proběhlá se nepočítá → bez listu). Bez listu hned proceed(false) a → false; s listem → true a proceed(true)
   * až po volbě nebo zavření listu.
   */
  function gateNewTrip(kind, proceed, newTrip) {
    let sheet = null, obs = null;
    const f = gateFlow(S.trips, newTrip, ymd(), {
      proceed: asked => { if (obs) obs.disconnect(); proceed(asked); },
      show: html => { modalOpen(html); sheet = q('#modal .plus-sheet'); },
      hit,
      // „Nebo 149 Kč na měsíc. Obnovení vypneš…“ pod odpovědí, že Plus ještě není, by sliboval předplatné, které neběží
      thanks: () => { if (sheet) { sheet.querySelector('.plus-small').hidden = true; after(sheet.querySelector('.plus-acts'), 'Plus chystáme na jaro. Do té doby si nech obě cesty zdarma – zůstanou ti.'); } },
      download: () => { if (window.Backup && Backup.download) { Backup.download(); toast('Záloha stažena – cesta v ní je'); } },
      close: () => modalClose(),
      confirm: msg => confirm(msg),
      // app.js delTrip: cestu otevřenou v průvodci odebere i z něj a nabídne ↩ Vrátit
      remove: t => { const i = S.trips.indexOf(t); if (i >= 0) window.delTrip(i); },
    });
    if (!f) return false;
    sheet.querySelectorAll('[data-pl]').forEach(b => { b.onclick = () => f.choose(b.dataset.pl); });
    // zavření bez volby (✕, klepnutí vedle, Zpět) i okno nahrazené jiným = nic nevybráno → cesta se uloží
    obs = new MutationObserver(() => { if (!q('#modalBg').classList.contains('show') || !sheet.isConnected) f.closed(); });
    obs.observe(q('#modalBg'), { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
    return true;
  }

  /** Karta na Přehledu (el = #plusCard); first = první návštěva (uvítání) – žádná nabídka. */
  function renderCard(el, first) {
    if (!el) return;
    let hidden = [];
    try { hidden = JSON.parse(store.get(CARD_KEY) || '[]'); } catch (e) { hidden = []; }
    if (!Array.isArray(hidden)) hidden = [];
    const pick = first ? null : cardPick(S.trips, ymd(), hidden);
    el.hidden = !pick;
    if (!pick) { el.innerHTML = ''; return; }
    el.innerHTML = `<span class="dt-ic" aria-hidden="true">📒</span><div class="dt-b">${h(cardText(pick, genOf(placeOf(pick.trip))))}
      <div class="plus-card-acts"><button type="button" class="btn sm" id="plusCardGo">Ukázat</button><button type="button" class="btn sm ghost" id="plusCardX">Teď ne</button></div></div>`;
    q('#plusCardGo').onclick = () => sesit(pick.trip);
    q('#plusCardX').onclick = () => { store.set(CARD_KEY, JSON.stringify([...hidden, tripKey(pick.trip)].slice(-30))); el.hidden = true; };
  }

  /** Položka v ⋯ Další (app.js openMore). */
  function addToMenu(list) {
    list.insertAdjacentHTML('beforeend', `<button type="button" class="btn ghost" id="morePlus">⭐ ${h(NAME)} <span class="faint">co je zdarma a co v Plus</span></button>`);
    list.querySelector('#morePlus').onclick = open;
  }

  window.Plus = { NAME, YEAR_CZK, MONTH_CZK, PRICES, counts, countedTrips, needsGate, askDue, cardPick, cardText, termTxt, sesitLine, gateFlow, tripKey, open, sesit, sesitShown, gateNewTrip, renderCard, addToMenu };
})();
