/* ATLAS – ℹ️ O aplikaci a soukromí (⋯ Další): co ATLAS je, odkud bere data, co se kde ukládá a posílá, jak se řadí
   výsledky, verze a 💬 Napsat nám. Texty o soukromí odpovídají kódu: uložené věci jsou jen v localStorage prohlížeče,
   server nemá účty ani cookies a nic nezapisuje na disk; ukládá jen cesty sdílené krátkým odkazem (server/lib/
   shortlinks.js – Upstash, 400 dní) a souhrnné denní počty událostí bez vazby na člověka či zařízení (server/lib/
   counts.js). test/about.test.js hlídá, že se to nezmění potichu.
   Tlačítko 💬 Napsat nám je jen s adresou z /api/health (feedback.email = proměnná FEEDBACK_EMAIL na serveru) –
   v kódu žádná adresa není. Stejně 💛 Podpořit ATLAS (support.url = SUPPORT_URL, platební odkaz Stripe) a provozovatel
   (operator = OPERATOR). */
(function () {
  const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // stejné pravidlo jako server (config.js cleanEmail) – cizí hodnota nesmí do mailto přidat adresáty ani hlavičky
  const okEmail = v => typeof v === 'string' && /^[\w.+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,24}$/i.test(v);
  // 💛 Podpořit ATLAS: jen platební odkaz Stripe (config.js cleanPayUrl) – u tlačítka stojí, že platbu zpracovává Stripe
  const okPay = v => typeof v === 'string' && /^https:\/\/buy\.stripe\.com\/[A-Za-z0-9_-]{4,80}$/.test(v);

  // Odkud jsou data – podle server/providers, server/lib a README (Odkud bere ceny, Data a licence). Tady jen zdroje,
  // které běží vždy; letenky, ubytování, vlak a Mapy.com jdou na serveru vypnout – ty skládá sources() z /api/health.
  const SOURCES = [
    ['🌤️', 'Počasí a podnebí', 'MET Norway (předpověď, CC BY 4.0), dlouhodobé průměry NOAA a NASA POWER'],
    ['🏛️', 'Místa a program', 'Wikidata, Wikipedie a Wikivoyage'],
    ['📷', 'Fotky', 'Unsplash, Pexels a Wikimedia Commons'],
    ['⛽', 'Palivo a kurzy', 'ČSÚ a Weekly Oil Bulletin EU (CC BY 4.0, upraveno); kurzy ECB a open.er-api.com'],
    ['🛂', 'Vstup a letiště', 'MZV ČR a oficiální weby e-víz; letiště z OurAirports a OpenFlights (ODbL)'],
    ['🏳️', 'Vlajky', 'písmo Twemoji (CC BY 4.0) tam, kde systém vlajky neumí (Windows)'],
  ];

  /** Seznam zdrojů (čistá funkce – test/o-aplikaci-zdroje.test.js): vypnutý zdroj (providers[].enabled, maps[].enabled
      z /api/health) se neukáže. Bez health (načítá se, server neodpovídá) jen to, co platí vždy – okno nesmí slibovat
      zdroj, který na serveru neběží. */
  function sources(health) {
    const list = health && Array.isArray(health.providers) ? health.providers : null;
    const on = (id, from = list) => Boolean(from && from.some(p => p && p.id === id && p.enabled === true));
    const air = ['ryanair', 'wizzair'].filter(id => on(id)).map(id => (id === 'ryanair' ? 'Ryanair' : 'Wizz Air'));
    const fly = [
      air.length ? `${air.join(' a ')} (přímo z ${air.length > 1 ? 'jejich webů' : 'jeho webu'})` : '',
      on('kiwi') ? 'Kiwi.com' : '',
      on('travelpayouts') ? 'Travelpayouts / Aviasales (ceny z vyhledávání za posledních ~48 h)' : '',
      health && health.demo === true ? 'vymyšlená ukázková data (DEMO)' : '',
    ].filter(Boolean);
    const stay = [
      on('xotelo') ? 'TripAdvisor přes Xotelo (orientační ceny)' : '',
      on('liteapi') ? 'LiteAPI' : '',
      on('osm') ? 'penziony z OpenStreetMap (bez ceny)' : '',
    ].filter(Boolean);
    const mapy = on('mapy', health && Array.isArray(health.maps) ? health.maps : null);
    return [
      // bez health nevíme, které letenky běží – obecná věta místo starého pevného seznamu
      fly.length ? ['✈️', 'Letenky', fly.join(', ')] : list ? null : ['✈️', 'Letenky', 'Zdroje se načítají…'],
      ['🏨', 'Ubytování', `${stay.length ? `${stay.join(', ')}; ` : ''}odkazy na Booking.com, Airbnb, Trip.com, Agodu a Hostelworld`],
      // RegioJet živě jen, když ho health hlásí zapnutý; odkaz na jeho web je vždy (server/lib/ground.js)
      ['🚆', 'Vlak a bus', on('regiojet') ? 'RegioJet (spoje a ceny na vyžádání); FlixBus a IDOS jen jako odkazy' : 'RegioJet, FlixBus a IDOS jen jako odkazy'],
      SOURCES[0],
      ['🗺️', 'Mapy a trasy', `OpenFreeMap a OpenStreetMap, ${mapy ? 'Mapy.com, ' : ''}BRouter (trasy na kole, pěšky a autem), chaty u túr z OpenStreetMap (Overpass); hledání míst GeoNames (CC BY 4.0)`],
      ...SOURCES.slice(1),
    ].filter(Boolean);
  }

  /** Věta o provizi podle /api/health affiliate (partnerské odkazy Travelpayouts); bez health žádná. */
  function earnings(health) {
    if (!health || typeof health.affiliate !== 'boolean') return '';
    return health.affiliate
      ? 'Z některých odkazů na prodejce můžu dostat provizi. Cenu ani pořadí výsledků to nemění. Takové odkazy jsou označené <span class="ad-tag">reklama</span>.'
      : 'Odkazy na prodejce jsou obyčejné odkazy, provizi z nich nemám.';
  }

  /** Předmět e-mailu: verze a obrazovka, ze které uživatel píše (ať je jasné, o čem je řeč). */
  const subject = (version, screen) => `Letsi – zpětná vazba (verze ${version || '?'}${screen ? `, obrazovka: ${screen}` : ''})`;
  /** mailto: odkaz, nebo null bez platné adresy. */
  function mailto(email, version, screen) {
    if (!okEmail(email)) return null;
    return `mailto:${email}?subject=${encodeURIComponent(subject(version, screen))}`;
  }

  /** Správce údajů, kontakt, stížnost u ÚOOÚ a odkazy na plné zásady a podmínky (server/lib/pravni.js vykreslí
      docs/pravni/*.md) – vždy, i bez /api/health: informační povinnost (čl. 13 GDPR) nesmí záviset na odpovědi
      serveru. Jméno a e-mail jen z prostředí (OPERATOR, FEEDBACK_EMAIL), v kódu nejsou; bez nich zástupný text. */
  function legal(op, email) {
    const btn = 'style="width:100%;justify-content:center;margin-top:6px" target="_blank" rel="noopener"';
    return `<h4 class="ab-h">Správce údajů a právní texty</h4>
      <p style="font-size:14px">Správce osobních údajů: <b id="abOp">${op ? h(op) : 'provozovatel Letsi'}</b>${op ? '' : ' <span class="faint">(jméno a IČO doplníme)</span>'}. Kontakt: ${email ? `<a id="abContact" href="mailto:${h(email)}">${h(email)}</a>` : '<span class="faint">e-mail doplníme</span>'}. Stížnost můžeš podat u <a href="https://uoou.gov.cz/" target="_blank" rel="noopener">Úřadu pro ochranu osobních údajů</a>.</p>
      <a class="btn ghost" id="abPrivacy" href="/soukromi" ${btn}>Zásady ochrany osobních údajů ↗</a>
      <a class="btn ghost" id="abTerms" href="/podminky" ${btn}>Podmínky užívání ↗</a>`;
  }

  /** Obsah okna (čistá funkce – test/about.test.js). email = feedback.email z /api/health (jinak bez tlačítka),
      support = support.url (💛 Podpořit ATLAS; jinak se neukáže), operator = provozovatel (jinak zástupný text
      v legal()) – obojí z /api/health; backup = je k dispozici 💾 Přenos a záloha; health = celé /api/health
      (zdroje, provize), null = ještě není;
      help = stav přepínače Pomáhat se zlepšováním (true / false), null = bez přepínače (count.js ho neumí). */
  function html({ version = '', build = '', email = null, screen = '', backup = true, support = null, operator = '', health = null, help = null } = {}) {
    const mail = mailto(email, version, screen), pay = okPay(support) ? support : null, earn = earnings(health);
    const op = typeof operator === 'string' ? operator.trim().slice(0, 200) : '';
    return `<div class="modal-body about-modal">
      <h3 style="margin-bottom:8px">ℹ️ O aplikaci a soukromí</h3>
      <p style="font-size:14px">Letsi najde levné letenky ze všech letišť ve tvém okolí a poskládá z nich celou cestu – ubytování, dopravu na letiště i na místě, program a shrnutí s odkazy k rezervaci. Je zdarma, bez účtu a bez registrace. Letenky ani hotely neprodává: rezervuješ vždy přímo u aerolinky nebo partnera.</p>
      ${legal(op, okEmail(email) ? email : '')}
      <h4 class="ab-h">Jak to funguje a z čeho žiju</h4>
      <p style="font-size:14px">Ceny porovnávám, letenku i ubytování koupíš vždy přímo u aerolinky nebo prodejce. Hledání a plánování je zdarma a bez reklamních bannerů. <b>Žádná aerolinka ani partner si za lepší pozici neplatí.</b>${earn ? ` ${earn}` : ''}</p>
      <h4 class="ab-h">Odkud jsou data</h4>
      <ul class="ab-list">${sources(health).map(([i, t, d]) => `<li><span aria-hidden="true">${i}</span> <b>${h(t)}</b> – ${h(d)}</li>`).join('')}</ul>
      <p class="faint" style="font-size:12px">Předpověď <a href="https://www.met.no/en" target="_blank" rel="noopener">MET Norway</a> a seznam míst <a href="https://www.geonames.org/" target="_blank" rel="noopener">GeoNames</a> jsou pod licencí <a href="https://creativecommons.org/licenses/by/4.0/deed.cs" target="_blank" rel="noopener">CC BY 4.0</a>, v aplikaci upravené (denní souhrny, výběr míst). Stejně ceny paliva z <a href="https://data.csu.gov.cz/datastat/info/SADA/CENPHMT" target="_blank" rel="noopener">ČSÚ</a> a <a href="https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en" target="_blank" rel="noopener">Weekly Oil Bulletin</a> (© Evropská unie; upraveno – přepočet na Kč/l) a vlajky <a href="https://twitter.github.io/twemoji" target="_blank" rel="noopener">Twemoji</a>. Letiště obsahují data © <a href="https://openflights.org/data" target="_blank" rel="noopener">OpenFlights</a> pod licencí <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener">ODbL</a>. Fotky měst dodávají <a href="https://www.pexels.com" target="_blank" rel="noopener">Pexels</a>, Unsplash a Wikimedia Commons – autor je u každé fotky pod ⓘ. Kurzy: <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener">Rates By Exchange Rate API</a>.</p>
      <p style="font-size:14px;margin-top:10px">Letsi není spojen s žádnou leteckou společností ani prodejcem; ceny a odkazy jsou z veřejných a partnerských zdrojů.</p>
      <h4 class="ab-h">Co se ukládá a kam</h4>
      <ul class="ab-list">
        <li><b>Jen v tomhle prohlížeči na tomhle zařízení</b> (localStorage): cesty, hlídané ceny, odložené nabídky, domov, navštívené země, oblíbená a skrytá místa, poslední i rozepsané hledání a nastavení. Na jiné zařízení je přeneseš odkazem (📲 Přenést do jiného zařízení) nebo zálohou.</li>
        <li><b>Na serveru nic o tobě</b>: žádný účet ani profil. <b>Žádné cookies ani sledování jednotlivců</b> – kromě záznamu návštěvy bez jména a IP adresy, pokud ho sám zapneš (Pomáhat se zlepšováním – přepínač níž v tomhle okně). Počítám jen souhrnné denní počty (kolikrát se otevřela aplikace, kolik proběhlo hledání, kolik cest vzniklo, kde aplikace nic nenašla nebo selhala a které možnosti lidé volí v krátkých otázkách) – bez osobních údajů a bez vazby na tebe nebo tvoje zařízení. Jinak jen cesty, které sám sdílíš krátkým odkazem (níže).</li>
        <li><b>Co se na server posílá</b> – jen to, co je potřeba k odpovědi: u hledání letů odkud, kam, termín, počet cestujících, zavazadla a cesta na letiště (i 🏠 vlastní ceny); u ubytování místo, termín a počet hostů; v Objevuj místo a volby plánu; polohu, jen když sám použiješ 📍 Moje poloha nebo Moje okolí. Server odpovědi chvíli drží v mezipaměti (bez vazby na tebe) a IP adresu si kvůli limitům požadavků pamatuje nejdéle hodinu od posledního požadavku (u hledání 10 minut), pak ji sám smaže.</li>
        <li><b>Přímo z prohlížeče</b> se načítají mapy (OpenFreeMap) a fotky (Unsplash, Pexels, Wikimedia) – tyhle služby vidí tvou IP adresu jako u každého webu. Počasí, kurzy a hledání míst jdou přes server Letsi, tvou adresu tedy nevidí.</li>
        <li><b>Krátký odkaz na sdílenou cestu</b> (letsi.cz/c/…): když klepneš na Poslat kamarádům nebo Sdílet plán, cesta se uloží na serveru na 400 dní, aby šel odkaz otevřít – bez jména a kódů rezervací, nic dalšího se k němu neukládá. Bez krátkého odkazu (i u odkazu 📲 přenosu) nese data část adresy za #, kterou prohlížeč na server neposílá. Po klepnutí na odkaz k rezervaci jsi na webu partnera a platí jeho pravidla.</li>
        ${pay ? '<li><b>Příspěvek</b> (💛 Podpořit Letsi): platíš na stránce Stripe, která platbu zpracovává – aplikace ani server Letsi údaje o platbě a kartě nedostanou. Provozovatel ve Stripe uvidí jen údaje k přijaté platbě (jméno, e-mail, částku a poslední 4 číslice karty).</li>' : ''}
      </ul>
      ${typeof help === 'boolean' ? `<button type="button" class="btn ghost" id="abHelp" role="switch" aria-checked="${help}"><span class="ico i-cestujici" aria-hidden="true"></span> Pomáhat se zlepšováním <span class="faint">${help ? 'zapnuto' : 'vypnuto'}</span></button>
      <p class="faint" style="font-size:12.5px">Záznam obrazovek a hlavních akcí při návštěvě s náhodným číslem návštěvy, bez textu, míst, cen, jména a IP adresy; smaže se do 31 dnů. Ve výchozím stavu vypnuto, vypnutím smažu i záznam právě probíhající návštěvy.</p>` : ''}
      ${backup ? '<button type="button" class="btn ghost" id="abBk">💾 Záloha do souboru <span class="faint">PC ↔ telefon</span></button>' : ''}
      <h4 class="ab-h">Jak se řadí výsledky</h4>
      <p style="font-size:14px">Pořadí určuje jen zvolené řazení (cena, termín, vzdálenost, dny dovolené…), placené pozice nejsou.</p>
      <h4 class="ab-h">Ceny jsou orientační</h4>
      <p style="font-size:14px">Aerolinky a hotely ceny mění i během minut a ceny označené jako orientační můžou být starší. Platí cena, kterou ukáže web prodejce před zaplacením – <b>vždy ji ověř u partnera</b>.</p>
      ${pay ? `<h4 class="ab-h">Podpoř Letsi</h4>
      <p style="font-size:14px">Letsi je zdarma a bez reklam v pořadí výsledků. Jestli ti to pomohlo, můžeš poslat dobrovolný příspěvek – částku si zvolíš, zaplatíš kartou na stránce Stripe.</p>
      <a class="btn" id="abSupport" href="${h(pay)}" target="_blank" rel="noopener">💛 Podpořit Letsi ↗</a>` : ''}
      ${mail ? `<a class="btn primary" id="abMail" href="${h(mail)}">💬 Napsat nám</a>` : ''}
      <p class="faint" style="font-size:12.5px;margin-top:12px">Verze ${h(version || '?')}${build ? ` · sestavení ${h(build)}` : ''}</p>
    </div>`;
  }

  // Obrazovka, ze které uživatel přišel – název sekce z hlavičky (Lety, Cesta…), okno ⋯ Další ho nemění.
  const screenNow = () => {
    const t = document.querySelector('#pageTitle');
    return (t && t.textContent.trim()) || (typeof activeView !== 'undefined' ? activeView : '');
  };
  const versionNow = () => (typeof WN_ID !== 'undefined' ? WN_ID : '');
  // sestavení (otisk souborů aplikace) z <meta name="atlas-build"> – server ho dosadí (server/lib/pwa.js serveIndex);
  // WN_ID se mění jen s novinkami, podle sestavení je jasné, která verze kódu běží
  const buildNow = () => { const m = document.querySelector('meta[name="atlas-build"]'); return (m && m.getAttribute('content')) || ''; };

  function open() {
    const version = versionNow(), build = buildNow(), screen = screenNow();
    const paint = (o = {}) => {
      modalOpen(html({ version, build, screen, backup: Boolean(window.Backup), help: window.Count && Count.consent ? Count.helping() : null, ...o }), { x: true });
      if (typeof helpSwitch === 'function') helpSwitch(document.querySelector('#abHelp')); // stejný přepínač jako v Další (app.js)
      const bk = document.querySelector('#abBk');
      if (bk) bk.onclick = () => { modalClose(); Backup.open(); };
    };
    paint();
    document.querySelector('#modal').scrollTop = 0; // z ⋯ Další (okno už otevřené) začít nahoře
    // zdroje, provize, adresa pro 💬, odkaz 💛 a provozovatel z /api/health (stejný dotaz, který app.js stahuje při
    // startu) – okno se překreslí, jen když je pořád otevřené
    if (!window.Flights || !Flights.warm) return;
    Flights.warm().then(hl => {
      if (!hl || typeof hl !== 'object') return;
      const o = { health: hl, email: hl.feedback && hl.feedback.email, support: hl.support && hl.support.url, operator: typeof hl.operator === 'string' ? hl.operator : '' };
      const box = document.querySelector('#modal .about-modal');
      if (box && document.querySelector('#modalBg.show')) {
        const top = document.querySelector('#modal').scrollTop;
        paint(o);
        document.querySelector('#modal').scrollTop = top;
      }
    }, () => { /* bez serveru zůstane okno bez tlačítek a jen se zdroji, které platí vždy */ });
  }

  /** Položka v ⋯ Další (app.js openMore). */
  function addToMenu(list) {
    list.insertAdjacentHTML('beforeend', '<button type="button" class="btn ghost" id="moreAbout"><span class="ico i-info" aria-hidden="true"></span> O aplikaci a soukromí <span class="faint">data, verze</span></button>');
    list.querySelector('#moreAbout').onclick = open;
  }
  // Počítač a tablet nemají ⋯ Další (lišta dole je jen na telefonu): odkaz v postranním panelu pod přepínačem motivu,
  // vzhled jako přepínač motivu (atlas.css .side-about). Na telefonu je panel skrytý. V node testu (vm) DOM není.
  if (typeof document !== 'undefined') {
    const toggle = document.querySelector('#themeToggle');
    if (toggle && !document.querySelector('#sideAbout')) {
      toggle.insertAdjacentHTML('afterend', '<button type="button" class="theme-toggle side-about" id="sideAbout"><span class="ico i-info" aria-hidden="true"></span> O aplikaci a soukromí</button>');
      document.querySelector('#sideAbout').onclick = open;
    }
  }

  window.About = { open, html, legal, mailto, subject, addToMenu, okPay, SOURCES, sources, earnings };
})();
