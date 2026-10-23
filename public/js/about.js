/* ATLAS – ℹ️ O aplikaci a soukromí (⋯ Další): co ATLAS je, odkud bere data, co se kde ukládá a posílá, jak se řadí
   výsledky, verze a 💬 Napsat nám. Texty o soukromí odpovídají kódu: uložené věci jsou jen v localStorage prohlížeče,
   server nemá databázi ani cookies a nic nezapisuje na disk (test/about.test.js hlídá, že se to nezmění potichu).
   Tlačítko 💬 Napsat nám je jen s adresou z /api/health (feedback.email = proměnná FEEDBACK_EMAIL na serveru) –
   v kódu žádná adresa není. */
(function () {
  const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // stejné pravidlo jako server (config.js cleanEmail) – cizí hodnota nesmí do mailto přidat adresáty ani hlavičky
  const okEmail = v => typeof v === 'string' && /^[\w.+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,24}$/i.test(v);

  // Odkud jsou data – podle server/providers, server/lib a README (Odkud bere ceny, Data a licence).
  const SOURCES = [
    ['✈️', 'Letenky', 'Ryanair a Wizz Air (přímo z jejich webů), Kiwi.com, Travelpayouts / Aviasales (ceny z vyhledávání za posledních ~48 h)'],
    ['🏨', 'Ubytování', 'TripAdvisor přes Xotelo (orientační ceny), LiteAPI, když je na serveru zapnuté, penziony z OpenStreetMap (bez ceny); odkazy na Booking.com, Airbnb, Trip.com, Agodu a Hostelworld'],
    ['🚆', 'Vlak a bus', 'RegioJet (spoje a ceny na vyžádání); FlixBus a IDOS jen jako odkazy'],
    ['🌤️', 'Počasí a podnebí', 'Open-Meteo (předpověď a hledání míst), dlouhodobé průměry NOAA a NASA POWER'],
    ['🗺️', 'Mapy a trasy', 'OpenFreeMap a OpenStreetMap, Mapy.com, BRouter (trasy na kole, pěšky a autem), chaty u túr z OpenStreetMap (Overpass)'],
    ['🏛️', 'Místa a program', 'Wikidata, Wikipedie a Wikivoyage'],
    ['📷', 'Fotky', 'Unsplash, Pexels a Wikimedia Commons'],
    ['⛽', 'Palivo a kurzy', 'ČSÚ a Weekly Oil Bulletin EU; kurzy ECB a open.er-api.com'],
    ['🛂', 'Vstup a letiště', 'MZV ČR a oficiální weby e-víz; letiště z OurAirports a OpenFlights'],
  ];

  /** Předmět e-mailu: verze a obrazovka, ze které uživatel píše (ať je jasné, o čem je řeč). */
  const subject = (version, screen) => `ATLAS – zpětná vazba (verze ${version || '?'}${screen ? `, obrazovka: ${screen}` : ''})`;
  /** mailto: odkaz, nebo null bez platné adresy. */
  function mailto(email, version, screen) {
    if (!okEmail(email)) return null;
    return `mailto:${email}?subject=${encodeURIComponent(subject(version, screen))}`;
  }

  /** Obsah okna (čistá funkce – test/about.test.js). email = feedback.email z /api/health (jinak bez tlačítka),
      backup = je k dispozici 💾 Přenos a záloha. */
  function html({ version = '', email = null, screen = '', backup = true } = {}) {
    const mail = mailto(email, version, screen);
    return `<div class="modal-body about-modal">
      <h3 style="margin-bottom:8px">ℹ️ O aplikaci a soukromí</h3>
      <p style="font-size:14px">ATLAS najde levné letenky ze všech letišť ve tvém okolí a poskládá z nich celou cestu – ubytování, dopravu na letiště i na místě, program a shrnutí s odkazy k rezervaci. Je zdarma, bez účtu a bez registrace. Letenky ani hotely sám neprodává: rezervuješ vždy přímo u aerolinky nebo partnera.</p>
      <h4 class="ab-h">Odkud jsou data</h4>
      <ul class="ab-list">${SOURCES.map(([i, t, d]) => `<li><span aria-hidden="true">${i}</span> <b>${h(t)}</b> – ${h(d)}</li>`).join('')}</ul>
      <h4 class="ab-h">Co se ukládá a kam</h4>
      <ul class="ab-list">
        <li><b>Jen v tomhle prohlížeči na tomhle zařízení</b> (localStorage): cesty, hlídané ceny, odložené nabídky, domov, navštívené země, oblíbená a skrytá místa, poslední i rozepsané hledání a nastavení. Na jiné zařízení je přeneseš odkazem s QR kódem (📲 Přenést do jiného zařízení) nebo zálohou.</li>
        <li><b>Na serveru nic o tobě</b>: žádný účet, databáze ani soubory s tvými daty, <b>žádné cookies, analytika ani měření návštěvnosti</b>.</li>
        <li><b>Co se na server posílá</b> – jen to, co je potřeba k odpovědi: u hledání letů odkud, kam, termín, počet cestujících, zavazadla a cesta na letiště (i 🏠 vlastní ceny); u ubytování místo, termín a počet hostů; v Objevuj místo a volby plánu; polohu, jen když sám použiješ 📍 Moje poloha nebo Moje okolí. Server odpovědi chvíli drží v mezipaměti (bez vazby na tebe) a IP adresu si pamatuje 10 minut kvůli limitu hledání.</li>
        <li><b>Přímo z prohlížeče</b> se načítá počasí a hledání míst (Open-Meteo), kurzy v okně země (open.er-api.com), písmo (Google Fonts), mapy (OpenFreeMap, OpenStreetMap) a fotky (Unsplash, Pexels, Wikimedia) – tyhle služby vidí tvou IP adresu jako u každého webu.</li>
        <li>Sdílený odkaz na cestu nese plán (odkaz 📲 přenosu tvoje data) v části adresy za #, kterou prohlížeč na server neposílá. Po klepnutí na odkaz k rezervaci jsi na webu partnera a platí jeho pravidla.</li>
      </ul>
      ${backup ? '<button type="button" class="btn ghost" id="abBk">💾 Přenos a záloha <span class="faint">PC ↔ telefon</span></button>' : ''}
      <h4 class="ab-h">Jak se řadí výsledky</h4>
      <p style="font-size:14px">Pořadí určuje jen zvolené řazení (cena, termín, vzdálenost, dny dovolené…) – <b>žádná aerolinka ani partner si za lepší pozici neplatí</b>. Některé odkazy (Aviasales, Booking.com, DiscoverCars) můžou být partnerské a jsou označené <span class="ad-tag">reklama</span>: při nákupu přes ně může ATLAS dostat provizi, cenu ani pořadí to nemění.</p>
      <h4 class="ab-h">Ceny jsou orientační</h4>
      <p style="font-size:14px">Aerolinky a hotely ceny mění i během minut a ceny z mezipaměti (⏱) můžou být starší. Platí cena, kterou ukáže web prodejce před zaplacením – <b>vždy ji ověř u partnera</b>.</p>
      ${mail ? `<a class="btn primary" id="abMail" href="${h(mail)}">💬 Napsat nám</a>` : ''}
      <p class="faint" style="font-size:12.5px;margin-top:12px">Verze ${h(version || '?')}</p>
    </div>`;
  }

  // Obrazovka, ze které uživatel přišel – název sekce z hlavičky (Lety, Cesta…), okno ⋯ Další ho nemění.
  const screenNow = () => {
    const t = document.querySelector('#pageTitle');
    return (t && t.textContent.trim()) || (typeof activeView !== 'undefined' ? activeView : '');
  };
  const versionNow = () => (typeof WN_ID !== 'undefined' ? WN_ID : '');

  function open() {
    const version = versionNow(), screen = screenNow();
    const paint = email => {
      modalOpen(html({ version, email, screen, backup: Boolean(window.Backup) }));
      const bk = document.querySelector('#abBk');
      if (bk) bk.onclick = () => { modalClose(); Backup.open(); };
    };
    paint(null);
    document.querySelector('#modal').scrollTop = 0; // z ⋯ Další (okno už otevřené) začít nahoře
    // adresa pro 💬 z /api/health (stejný dotaz, který app.js stahuje při startu) – okno se překreslí, jen když je
    // pořád otevřené a adresa opravdu je
    if (!window.Flights || !Flights.warm) return;
    Flights.warm().then(hl => {
      const email = hl && hl.feedback && hl.feedback.email;
      const box = document.querySelector('#modal .about-modal');
      if (okEmail(email) && box && document.querySelector('#modalBg.show')) {
        const top = document.querySelector('#modal').scrollTop;
        paint(email);
        document.querySelector('#modal').scrollTop = top;
      }
    }, () => { /* bez serveru zůstane okno bez tlačítka */ });
  }

  /** Položka v ⋯ Další (app.js openMore). */
  function addToMenu(list) {
    list.insertAdjacentHTML('beforeend', '<button type="button" class="btn ghost" id="moreAbout">ℹ️ O aplikaci a soukromí <span class="faint">data, verze</span></button>');
    list.querySelector('#moreAbout').onclick = open;
  }
  // Počítač a tablet nemají ⋯ Další (lišta dole je jen na telefonu): odkaz v postranním panelu pod přepínačem motivu,
  // vzhled jako přepínač motivu (atlas.css .side-about). Na telefonu je panel skrytý. V node testu (vm) DOM není.
  if (typeof document !== 'undefined') {
    const toggle = document.querySelector('#themeToggle');
    if (toggle && !document.querySelector('#sideAbout')) {
      toggle.insertAdjacentHTML('afterend', '<button type="button" class="theme-toggle side-about" id="sideAbout">ℹ️ O aplikaci a soukromí</button>');
      document.querySelector('#sideAbout').onclick = open;
    }
  }

  window.About = { open, html, mailto, subject, addToMenu, SOURCES };
})();
