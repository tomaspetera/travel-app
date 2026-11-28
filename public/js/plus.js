/* ATLAS – ⭐ nabídka placené verze jako „falešné dveře“: stránka Zdarma × Plus, list při druhé cestě, Sešit cesty,
   karta 14 dní před odletem a otázka, kolik by Plus stálo za rok. Platby zatím neběží – nic se nezamyká ani nemaže
   bez výslovného potvrzení, každé tlačítko poctivě řekne, že Plus teprve chystáme. Co lidé zvolí, se počítá jen
   souhrnně (Count.hit, události ze seznamu EVENTS v server/lib/counts.js). Do prohlížeče se ukládá jen den poslední
   otázky na cenu a skryté karty sešitu – žádný identifikátor. Čisté funkce (bez DOM) testuje test/plus.test.js. */
(function () {
  // název placené verze na jednom místě – při přejmenování na Letsi se mění jen tady
  const NAME = 'Letsi Plus';
  // plánovaná cena – ukáže ji jen priceNote po odpovědi na otázku o ceně, nikde dřív
  const YEAR_CZK = 399, MONTH_CZK = 149;
  const PRICES = [0, 199, 399, 599, 799];
  const ASK_DAYS = 30; // otázka na cenu nejvýš jednou za 30 dní
  const CARD_DAYS = 14; // karta sešitu na Přehledu nejdřív 14 dní před odletem
  const ASK_KEY = 'atlas_price_q', CARD_KEY = 'atlas_sesit_card', TIME_KEY = 'atlas_time_q';
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
  /**
   * Věta o plánované ceně Plus – až po odpovědi na „Kolik by ti Plus stálo za rok?“ (answer = data-price zvolené
   * odpovědi). Cena ukázaná dřív by odpovědi stáhla k sobě (kotva) a průzkum by neměřil nic.
   */
  const priceNote = answer => (PRICES.map(String).includes(String(answer ?? '')) ? `Plánujeme kolem ${kc(YEAR_CZK)} na rok (nebo ${kc(MONTH_CZK)} na měsíc).` : '');
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
    const list = countedTrips(trips, today), cur = list[0], name = placeOf(cur);
    let done = false;
    const go = () => { if (!done) { done = true; io.proceed(true); } };
    io.show(sheetHtml(cur, list.length));
    io.hit('limit_shown');
    return {
      cur,
      choose(c) {
        if (done) return;
        if (c === 'plus') { io.hit('limit_plus'); go(); io.thanks(list.length); }
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

  /**
   * Malé tlačítko „· Plus“ u věci (falešné dveře, odpověď „chystáme na jaro“). Nabízí se jen u vlastní uložené cesty
   * s termínem, která zrovna neběží: ne u cesty od jiného (sdílená cesta je reklama zdarma), ne u sama uložené
   * rozpracované (auto) a ne během cesty (tam je „Dnes na cestě“, bez Plus). Cestu otevřenou v průvodci vynechá volající.
   */
  function similarOk(t, today) {
    if (!t || typeof t !== 'object' || t.auto || fromOther(t) || !isYmd(t.start)) return false;
    const end = isYmd(t.end) ? t.end : t.start;
    return !(t.start <= today && today <= end);
  }
  // kind → [text tlačítka, nadpis okna, co by to dělalo]; události plus_<kind>_shown a plus_<kind>_click v EVENTS
  const SOON_KIND = {
    similar: ['Naplánuj podobnou · Plus', 'Naplánuj podobnou', 'Cestu zkopíruješ jedním klepnutím na nový termín: trasa, noci, program po dnech, vlastní věci k sbalení i rozpočet. Ceny se načtou znovu.'],
    pack: ['Uložit jako šablonu · Plus', 'Moje balicí seznamy', 'Seznam si uložíš jako šablonu (Moře, Hory s dětmi…) a vlastní položky ti zůstanou pro další cesty. Každý z party dostane svůj seznam k odškrtání.'],
  };
  /** Tlačítko pro kind z SOON_KIND; key = která věc (cesta) – zobrazení se počítá jednou za načtení pro kind a key. */
  const soonBtn = (kind, key) => `<button type="button" class="linkbtn plus-soon" data-plus-soon="${kind}" data-plus-key="${h(key)}">${h(SOON_KIND[kind][0])}</button>`;

  /* ---------- HTML ---------- */
  // n = kolik započítaných cest už je: kdo jich má víc (uložené před limitem), tomu „jednu“ a „obě“ lhaly
  const uloz = n => (n <= 4 ? `uložené ${n} cesty` : `uložených ${n} cest`);
  function sheetHtml(cur, n = 1) {
    const name = h(placeOf(cur)), term = termTxt(cur), dot = term.endsWith('.') ? '' : '.';
    return `<div class="modal-body plus-sheet">
      <h3>${n > 1 ? 'Zdarma je místo pro jednu cestu' : 'Místo pro jednu cestu máš obsazené'}</h3>
      <p>${n > 1 ? `Teď tu máš ${uloz(n)}, nejbližší <b>${name}</b> ${h(term)}${dot}` : `Zdarma si tu držíš jednu cestu – teď <b>${name}</b> ${h(term)}${dot}`}</p>
      <div class="plus-acts">
        <button type="button" class="btn primary" data-pl="plus">Nechat si ${n > 1 ? 'všechny' : 'obě'} · Plus</button>
        <button type="button" class="btn" data-pl="download">Stáhnout ${name} do souboru a začít novou</button>
        <button type="button" class="btn ghost" data-pl="replace">Nahradit ${name} novou cestou</button>
      </div>
    </div>`;
  }
  // Anketa po „Chci Plus“: co z chystaného Plus ušetří nejvíc času. Počítá se jen klepnutá volba (události plus_q_*),
  // stejně jako otázka na cenu nejvýš jednou za 30 dní (do prohlížeče jen den, atlas_time_q).
  const TIME = [['plus_q_similar', 'Naplánuj podobnou'], ['plus_q_sesit', 'Sešit s průvodcem zemí'], ['plus_q_pack', 'Balicí šablony'],
    ['plus_q_nav', 'Celá cesta do navigace'], ['plus_q_variants', 'Varianty vedle sebe'], ['plus_q_split', 'Útraty party']];
  const timeHtml = () => `<div class="plus-price plus-time" id="plusTime"><b>Co by ti ušetřilo nejvíc času?</b>
    <div class="plus-opts">${TIME.map(([e, l]) => `<button type="button" class="btn sm" data-time="${e}">${h(l)}</button>`).join('')}</div></div>`;
  /**
   * Které otázky po „Chci Plus“ (time = i anketa o čase) a v jakém pořadí: cena první, anketa hned po odpovědi na cenu,
   * nebo sama, když se na cenu tentokrát neptáme. Obě nejvýš jednou za 30 dní (askDue). → ['price', 'time'] apod.
   */
  const askPlan = (lastPrice, lastTime, today, time) => [askDue(lastPrice, today) && 'price', time && askDue(lastTime, today) && 'time'].filter(Boolean);
  const priceHtml = () => `<div class="plus-price" id="plusPrice"><b>Kolik by ti Plus stálo za rok?</b>
    <div class="plus-opts">${PRICES.map(p => `<button type="button" class="btn sm" data-price="${p}">${p ? kc(p) : 'Nic, stačí mi zdarma'}</button>`).join('')}</div></div>`;
  // Na telefonu musí tabulka zůstat krátká: bezplatné řádky „✓ / ✓“ po dvou spojené, dva zůstávají jako ujištění.
  // Varianty a útraty tu zatím nejsou – měří je jen anketa (TIME), ať tabulka neslibuje příliš.
  const FREE = [
    ['Hledání letenek, orientační ceny a\u00a0ověření u\u00a0prodejce', 'ano', 'ano'],
    ['Informace o zemích a Objevuj', 'ano', 'ano'],
    ['Naplánované cesty (i\u00a0z\u00a0„Poskládej“)', 'jedna', 'neomezeně'], // pevné mezery: závorka se zalomí celá
    ['Záloha do souboru a sdílení cesty', 'ano', 'ano'],
    ['Balicí seznam podle počasí', 'ano', 'ano'], // chytrý seznam zůstává zdarma – Plus si jen pamatuje a dělí
    ['Kódy rezervací', 'ano', 'ano'], // dnes zdarma – vzít je by bylo zamčení bezplatné funkce
    ['Archiv a Naplánuj podobnou', 'ne', 'ano'],
    ['Sešit cesty s průvodcem zemí (PDF bez signálu)', 'ne', 'ano'], // informace o zemi zůstávají zdarma, Plus je jen uloží
    ['Vlastní šablony balení, seznam pro každého', 'ne', 'ano'],
    ['Celá cesta do navigace jedním souborem', 'ne', 'ano'],
  ];
  const cell = v => (v === 'ano' ? '<span aria-hidden="true">✓</span><span class="sr-only">ano</span>' : v === 'ne' ? '<span aria-hidden="true">–</span><span class="sr-only">ne</span>' : h(v));
  /**
   * Z čeho Letsi žije – provize jen při zapnutých partnerských odkazech (/api/health affiliate, stejně jako about.js
   * earnings), příspěvky jen s tlačítkem 💛 Podpořit Letsi v O aplikaci (support.url, About.okPay) – bez možnosti
   * přispět by „žije z příspěvků“ byl slib naprázdno. Dokud stav serveru neznáme, jen neutrální věta.
   */
  function livesTxt(health) {
    const aff = Boolean(health && health.affiliate === true);
    const pay = Boolean(health && health.support && window.About && About.okPay(health.support.url));
    if (!aff && !pay) return 'Letsi je zatím zdarma a pořadí výsledků si nikdo nekoupí.';
    const from = [aff && 'z provizí partnerů (takové odkazy jsou označené reklama)', pay && 'z dobrovolných příspěvků (💛 Podpořit Letsi v O aplikaci)'].filter(Boolean).join(' a ');
    return `Z čeho Letsi žije: ${from}, později i z předplatného Plus. Pořadí výsledků si nikdo nekoupí.`;
  }
  function pageHtml(health) {
    return `<div class="modal-body plus-page">
      <h3>${h(NAME)}</h3>
      <p>Co zůstane zdarma a co chystáme navíc.</p>
      <table class="plus-table"><thead><tr><th scope="col">Co</th><th scope="col">Zdarma</th><th scope="col">Plus <small>${SOON}</small></th></tr></thead>
        <tbody>${FREE.map(([what, a, b]) => `<tr><th scope="row">${h(what)}</th><td>${cell(a)}</td><td>${cell(b)}</td></tr>`).join('')}</tbody></table>
      <p class="faint plus-small" id="plusLives">${h(livesTxt(health))}</p>
      <div id="plusAfter"><button type="button" class="btn primary block" id="plusWant">Chci Plus</button></div>
    </div>`;
  }
  /** Číslo dne od začátku cesty jako v Průběhu cesty (den bez programu se nevynechá); bez data odjezdu pořadí. */
  const dayNo = (t, d, i) => (isYmd(t.start) && d >= t.start ? Math.round((Date.parse(d) - Date.parse(t.start)) / 864e5) + 1 : i + 1);
  /** Náhled sešitu z dat cesty (titul, termín, první dva dny programu) – žádný obrázek. */
  function sesitHtml(t, line) {
    const days = Object.keys(t.days && typeof t.days === 'object' ? t.days : {}).filter(d => isYmd(d) && Array.isArray(t.days[d]) && t.days[d].length).sort().slice(0, 2);
    const dayHtml = days.length ? days.map((d, i) => `<div class="ss-day"><b>Den ${dayNo(t, d, i)} · ${dm(d)}</b><ul>${t.days[d].slice(0, 4).map(x => `<li>${h(x)}</li>`).join('')}</ul></div>`).join('')
      : '<p class="faint">Program po dnech doplní průvodce cestou.</p>';
    return `<div class="modal-body plus-page">
      <h3>Sešit cesty</h3>
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

  /**
   * Fokus na novou otázku nebo poděkování (x) místo tlačítka, které zmizelo – jinak spadne na <body> a Tab ani čtečka
   * je nenajdou. Okno se posune, ať je see (anketa pod poděkováním, jinak x) celé vidět a volby nejsou pod okrajem.
   * Jen když se fokus ztratil: okno „· Plus“ (soon) má otázku hned od otevření a fokus tam řídí app.js jako u oken.
   */
  function focusIn(x, see) {
    const a = document.activeElement;
    if (!x || (a && a !== document.body)) return;
    x.tabIndex = -1;
    x.focus({ preventScroll: true });
    (see || x).scrollIntoView({ block: 'nearest' });
  }
  /** Do el (v otevřeném okně) zprávu a pod ni otázku na cenu, je-li čas se zeptat; time = po ní i anketa o čase (askPlan). */
  function after(el, msg, time) {
    if (!el) return;
    const today = ymd(), plan = askPlan(store.get(ASK_KEY), store.get(TIME_KEY), today, time);
    el.innerHTML = `<p class="note info plus-msg" role="status">${h(msg)}</p>`;
    const first = () => el.querySelector('#plusPrice, #plusTime') || el.querySelector('.plus-msg');
    const timeAsk = () => {
      el.insertAdjacentHTML('beforeend', timeHtml());
      store.set(TIME_KEY, today);
      el.querySelectorAll('[data-time]').forEach(b => { b.onclick = () => {
        hit(b.dataset.time);
        const box = el.querySelector('#plusTime');
        if (box) { box.innerHTML = '<p class="plus-thanks">Díky, podle toho vybereme, co postavit první.</p>'; focusIn(box.firstChild); }
      }; });
    };
    if (plan[0] !== 'price') { if (plan.length) timeAsk(); focusIn(first()); return; }
    el.insertAdjacentHTML('beforeend', priceHtml());
    store.set(ASK_KEY, today); // jen den – podle něj se za 30 dní zeptá znovu
    el.querySelectorAll('[data-price]').forEach(b => { b.onclick = () => {
      hit(`price_${b.dataset.price}`);
      const box = el.querySelector('#plusPrice');
      if (box) box.innerHTML = `<p class="plus-thanks">Díky, pomůže nám to nastavit cenu férově. ${priceNote(b.dataset.price)}</p>`;
      if (plan[1] && !el.querySelector('#plusTime')) timeAsk(); // anketa až po ceně – dvě otázky naráz by byly moc
      // fokus na poděkování (nese plánovanou cenu), anketa pod ním je další Tab
      if (box) focusIn(box.firstChild, el.querySelector('#plusTime'));
    }; });
    focusIn(first());
  }

  /** Stránka ⭐ Plus (okno): tabulka Zdarma × Plus a „Chci Plus“. */
  function open() {
    modalOpen(pageHtml(), { x: true });
    // Plus nahrazuje list Další nebo okno země i s jejich posunem – na 360 px by nadpis a ✕ byly nad okrajem
    q('#modal').scrollTop = 0;
    hit('plus_page'); hit('plus_offer_shown');
    q('#plusWant').onclick = () => { hit('plus_offer_click'); after(q('#plusAfter'), 'Plus chystáme na jaro – dáme vědět tady v aplikaci.', true); };
    // provize podle serveru (stejný dotaz /api/health, který app.js stahuje při startu) – jen věta, ať nezmizí odpověď na „Chci Plus“
    if (window.Flights && Flights.warm) Flights.warm().then(hl => { const p = q('#plusLives'); if (p) p.textContent = livesTxt(hl); }, () => { /* bez serveru zůstane věta bez provizí */ });
  }
  /** Okno Sešitu cesty pro uloženou cestu (záznam z Mých cest nebo stejná pole: name, dest, iso, start, end, days). */
  function sesit(t) {
    if (!t) return;
    const dest = placeOf(t);
    modalOpen(sesitHtml(t, sesitLine(dest, countryOf(t.iso), genOf(dest))), { x: true });
    q('#sesitWant').onclick = () => { hit('sesit_click'); after(q('#plusAfter'), 'Sešit chystáme na jaro – dáme vědět tady v aplikaci.'); };
  }
  const sesitSeen = new Set();
  /** 📒 Sešit cesty byl vidět (tlačítko ve Shrnutí, karta na Přehledu) – počítá se jednou za otevření aplikace pro danou cestu. */
  function sesitShown(id) {
    id = String(id); // Shrnutí posílá t.created (číslo), karta tripKey (text) – táž cesta se nesmí započítat dvakrát
    if (sesitSeen.has(id)) return;
    sesitSeen.add(id); hit('sesit_shown');
  }

  const landSeen = new Set();
  /**
   * Odkaz „Uložit do Sešitu · Plus“ v okně země (app.js openCountry, el = odkaz) byl vidět – jednou za otevření aplikace
   * a zemi. Až když je opravdu na obrazovce: na telefonu je pod podnebím daleko pod okrajem a kdo nedojede dolů, ten ho
   * neviděl – jinak by zájem vyšel přehnaně nízký (jako cardSeen u karty sešitu).
   */
  function countryShown(iso, el) {
    const seen = () => { if (landSeen.has(iso)) return; landSeen.add(iso); hit('sesit_country_shown'); };
    if (landSeen.has(iso)) return;
    if (!el || typeof IntersectionObserver === 'undefined') { seen(); return; }
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); seen(); } });
    io.observe(el);
  }
  /**
   * Klepnutí na ten odkaz: zájem se započítá a otevře se stránka Zdarma × Plus (cena až po otázce – priceNote). Okno
   * Plus nahradí okno země iso – po zavření (✕, klepnutí vedle, Escape, Zpět telefonu) se do něj vrátit na stejné místo,
   * uživatel jen nakoukl. Hlídá se jako u listu gateNewTrip: okno nahrazené jiným oknem = návrat už nemá smysl.
   */
  function fromCountry(iso) {
    hit('sesit_country_click');
    // posun okna: na telefonu jede celé okno, na počítači jen tělo vedle fotky (desktop-explore.css)
    const box = () => [q('#modal'), q('#modal>.modal-body')], y = box().map(e => (e ? e.scrollTop : 0));
    open();
    const page = q('#modal .plus-page'), bg = q('#modalBg');
    if (!iso || !page || typeof MutationObserver === 'undefined' || typeof openCountry !== 'function') return;
    const obs = new MutationObserver(() => {
      if (!page.isConnected) { obs.disconnect(); return; }
      if (bg.classList.contains('show')) return;
      obs.disconnect();
      openCountry(iso);
      box().forEach((e, i) => { if (e) e.scrollTop = y[i]; });
    });
    obs.observe(bg, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
  }

  const soonSeen = new Set();
  /**
   * Tlačítka „· Plus“ v root (soonBtn): zobrazení se počítá, až když je tlačítko opravdu na obrazovce (seznam balení je
   * na telefonu daleko dole, proběhlé cesty ve sbaleném „Proběhlé cesty“), jednou za otevření aplikace pro věc – jinak by
   * zájem vyšel přehnaně nízký (jako cardSeen). Klepnutí se počítá a otevře okno „chystáme na jaro“ s otázkou na cenu.
   * Volá se po každém vykreslení; už zapojené tlačítko přeskočí.
   */
  function watchSoon(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('[data-plus-soon]').forEach(b => {
      const kind = b.dataset.plusSoon, id = `${kind}|${b.dataset.plusKey}`;
      if (!SOON_KIND[kind] || b.dataset.plusOn) return;
      b.dataset.plusOn = '1';
      // karta cesty se klepnutím otevírá – klepnutí na tlačítko ji otevřít nesmí
      b.onclick = e => { e.stopPropagation(); hit(`plus_${kind}_click`); soon(kind); };
      const seen = () => { if (!soonSeen.has(id)) { soonSeen.add(id); hit(`plus_${kind}_shown`); } };
      if (soonSeen.has(id)) return;
      if (typeof IntersectionObserver === 'undefined') { seen(); return; }
      const io = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) { io.disconnect(); seen(); } });
      io.observe(b);
    });
  }
  /** Okno po klepnutí na „· Plus“: co to bude dělat, že to chystáme na jaro, a otázka na cenu (priceNote až po odpovědi). */
  function soon(kind) {
    const [, title, text] = SOON_KIND[kind];
    modalOpen(`<div class="modal-body plus-page"><h3>${h(title)}</h3><p>${h(text)}</p><div id="plusAfter"></div></div>`, { x: true });
    after(q('#plusAfter'), `Chystáme na jaro do ${NAME} – dáme vědět tady v aplikaci.`);
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
      // nadpis „máš obsazené“ a počet cest by pod odpovědí „nech si je“ odporovaly – cesta se už uložila (proceed před thanks)
      thanks: n => { if (sheet) { sheet.querySelector('h3').textContent = 'Cesta se uložila'; sheet.querySelector('h3 + p').hidden = true; after(sheet.querySelector('.plus-acts'), `Plus chystáme na jaro. Do té doby si nech ${n > 1 ? 'všechny' : 'obě'} cesty zdarma – zůstanou ti.`); } },
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

  /**
   * Karta sešitu byla vidět → sesit_shown (jednou za načtení a cestu, stejný klíč jako Shrnutí: tripId). Až když je
   * opravdu na obrazovce – klepnutí z karty se počítají, a bez zobrazení by zájem o Sešit vyšel přehnaně vysoký.
   */
  let cardIO = null;
  function cardSeen(el, key) {
    if (cardIO) cardIO.disconnect();
    if (typeof IntersectionObserver === 'undefined') { sesitShown(key); return; }
    cardIO = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { cardIO.disconnect(); sesitShown(key); } });
    cardIO.observe(el);
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
    cardSeen(el, tripKey(pick.trip));
    q('#plusCardX').onclick = () => { store.set(CARD_KEY, JSON.stringify([...hidden, tripKey(pick.trip)].slice(-30))); el.hidden = true; };
  }

  /** Položka v ⋯ Další (app.js openMore). */
  function addToMenu(list) {
    list.insertAdjacentHTML('beforeend', `<button type="button" class="btn ghost" id="morePlus"><span class="ico i-oblibene" aria-hidden="true"></span> ${h(NAME)} <span class="faint">co je zdarma a co v Plus</span></button>`);
    list.querySelector('#morePlus').onclick = open;
  }
  // Počítač a tablet nemají ⋯ Další: odkaz v postranním panelu pod přepínačem motivu jako O aplikaci (about.js) –
  // jinak by stránka Zdarma × Plus s otázkou na cenu na počítači nešla otevřít. V node testu (vm) DOM není.
  if (typeof document !== 'undefined') {
    const toggle = document.querySelector('#themeToggle');
    if (toggle && !document.querySelector('#sidePlus')) {
      toggle.insertAdjacentHTML('afterend', `<button type="button" class="theme-toggle side-about" id="sidePlus"><span class="ico i-oblibene" aria-hidden="true"></span> ${h(NAME)}</button>`);
      document.querySelector('#sidePlus').onclick = open;
    }
  }

  window.Plus = { NAME, YEAR_CZK, MONTH_CZK, PRICES, priceNote, counts, countedTrips, needsGate, askDue, cardPick, cardText, termTxt, sesitLine, sesitHtml, pageHtml, livesTxt, gateFlow, tripKey, open, sesit, sesitShown, countryShown, fromCountry, gateNewTrip, renderCard, addToMenu,
    TIME, askPlan, similarOk, soonBtn, watchSoon };
})();
