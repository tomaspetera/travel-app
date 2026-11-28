# Podmínky užívání – Letsi (návrh pro advokáta)

> **Návrh, ne platný text.** Sepsáno podle skutečného chování kódu ke dni 16. 11. 2026 (podmínka spuštění č. 3
> z plánu 1.2). Údaje v hranatých závorkách doplní provozovatel – repozitář je veřejný. Poznámky „Kde v kódu“
> a oddíl Otázky pro advokáta do zveřejněné verze nepatří.

## 1. Kdo Letsi provozuje

Aplikaci Letsi (web https://letsi.cz a aplikace na plochu z něj nainstalovaná) provozuje:

- [jméno a příjmení]
- IČO: [IČO]
- adresa: [adresa]
- e-mail: [e-mail]

(dále „provozovatel“). Používáním aplikace s těmito podmínkami souhlasíš.

## 2. Co Letsi je

Letsi je **vyhledávač a plánovač cest**: hledá levné letenky z letišť v tvém okolí, ukazuje ubytování, dopravu na
letiště a na místě, počasí, vstupní podmínky a pomáhá poskládat program cesty.

**Letsi nic neprodává.** Není aerolinka, cestovní kancelář ani zprostředkovatel prodeje. Letenky, ubytování, jízdenky
a půjčení auta si kupuješ vždy **přímo u prodejce** (u letenek aerolinka nebo cestovní agentura, ke které tě přesměruje
Aviasales; Booking.com, Airbnb, RegioJet…), na jehož web tě odkaz pošle. Smlouvu uzavíráš s ním a platí jeho obchodní podmínky.

## 3. Zdarma a bez registrace

Používání Letsi je **zdarma**, bez účtu a registrace. Za služby se neplatí; dobrovolný příspěvek
(💛 Podpořit Letsi) je dar – nic za něj nedostáváš a na rozsah služby nemá vliv.

Provozovatel může službu kdykoli změnit, omezit nebo ukončit. Na dostupnost služby není nárok – server může být
krátce nedostupný (na bezplatném hostingu se po nečinnosti probouzí až minutu) a zdroje dat mohou vypadnout.

> Kde v kódu: `public/js/about.js` („Je zdarma, bez účtu a bez registrace“, „Letenky ani hotely sám neprodává“),
> `render.yaml` (`plan: free`), `public/sw.js` (uspaný server).

## 4. Ceny a spoje jsou orientační

Ceny a spoje Letsi získává z **veřejných zdrojů a od partnerů**: ceny letů a odkaz k nákupu letenky z Travelpayouts /
Aviasales, ubytování bez ceny z OpenStreetMap, spoje vlakem a busem od RegioJetu (je-li zapnutý) a dalších. Pokud jsou
zapnuté živé zdroje (testovací provoz), také z webů Ryanair a Wizz Air, Kiwi.com, TripAdvisoru (přes Xotelo) a LiteAPI.
Zdroje, které právě běží, jsou v aplikaci v ⋯ Další → ℹ️ O aplikaci a soukromí. Proto:

- Ceny se u prodejců mění i během minut. Ceny letů jsou orientační: pocházejí z vyhledávání jiných cestujících na
  Aviasales (Travelpayouts) za posledních ~48 hodin a jsou označené **orientační – ověř**. Pokud jsou zapnuté živé
  zdroje, jejich ceny se zjišťují při hledání.
  Výsledky starší než hodina aplikace označí časem; u výsledků starších 3 hodin první klepnutí na Koupit jen
  připomene stáří cen.
- **Závazná je vždy cena, kterou ukáže prodejce před zaplacením.** Před nákupem ji ověř na jeho webu.
- Ceny ubytování z TripAdvisoru (jen pokud jsou zapnuté – testovací provoz; jinak jsou u ubytování odkazy na partnery
  a místa bez ceny) jsou orientační; „od ~… / noc“ znamená běžnou cenu, ne nabídku na tvůj termín.
  Ceny ubytování nemusí obsahovat místní poplatky (např. městskou taxu), pokud je zdroj neuvádí.
- Prodejce může účtovat ve své měně (Aviasales v eurech; pokud jsou zapnuté živé zdroje, Ryanair a Wizz Air v měně
  země odletu); přepočet na koruny
  je podle aktuálního kurzu a skutečná částka se může lišit.
- Odhady (cena dopravy na letiště a do města, paliva, parkování, zavazadel, vstupních poplatků, doba cesty) jsou
  orientační a slouží k porovnání.
- Vstupní podmínky, víza a pokyny „Co zařídit“ jsou převzaté z MZV ČR a oficiálních zdrojů k datu uvedenému
  u údaje. Před cestou je ověř u úřadů.

> Kde v kódu: `README.md` (Odkud bere ceny, Ceny hotelů), `public/js/flights.js` (stáří výsledků, připomínka u Koupit),
> `public/js/trip.js` (věta „Cena bez místních poplatků…“, „Zavazadla jsou odhad podle dopravce“, „Ceny u partnerů
> ověř před zaplacením“), `public/js/about.js` (Ceny jsou orientační).

## 5. Konečná cena letenky a zavazadla

Podle nařízení (ES) č. 1008/2008 (čl. 23) musí cena letenky od prvního zobrazení obsahovat všechny nevyhnutelné
daně, letištní a jiné poplatky; volitelné příplatky se uvádějí zvlášť a srozumitelně. Letsi dnes cenu ukazuje takto:

- Cena ve výsledcích je **za osobu**, za letenku v nejlevnějším tarifu tak, jak ji vrátí zdroj (Aviasales; pokud jsou
  zapnuté živé zdroje, i aerolinka nebo Kiwi.com). U rodiny se ukazuje i celková cena za sedadla (děti platí jako dospělí, miminko na klíně bez poplatku
  aerolinky).
- **Zavazadla jsou volitelná a ukazují se zvlášť.** Výchozí hledání je bez zavazadel. Když v hledání zvolíš kabinový
  kufr nebo kufr k odbavení, Letsi k ceně připočte **odhad** příplatku podle ceníku dopravce a ukáže rozpis
  („letenka 1 234 Kč + zavazadla ~800 Kč“, „Cena letenek na osobu vč. zavazadel“). Ve Shrnutí cesty stojí, zda jsou
  zavazadla odhad, v ceně tarifu, nebo zda jsou letenky bez zavazadel.
- **Doprava na letiště a do města** se do ceny letenky nezapočítává – je u nabídky zvlášť jako odhad.
- Vstupní poplatky (ESTA, e-víza) jsou ve Shrnutí zvlášť pod součtem.

> Kde v kódu: `server/lib/baggage.js` (odhad příplatků podle dopravce, „ODHAD … ne ceník“), `public/js/flights.js`
> (výchozí `bags: 'none'`, popisek „letenka … + zavazadla ~…“, komentář „cena = letenka (+ zavazadla); doprava …
> jen v popisku jako odhad navíc“), `public/js/searchhelp.js` `originFoot()`, `public/js/trip.js` (Shrnutí: miminko,
> zavazadla, „Celkem i se vstupními poplatky“).

## 6. Partnerské odkazy (reklama)

Některé odkazy na prodejce jsou **partnerské** (affiliate) – dnes Aviasales, Booking.com a DiscoverCars přes síť
Travelpayouts. Jsou v aplikaci označené štítkem **„reklama“**. Když přes ně nakoupíš, může provozovatel dostat
provizi. **Cenu pro tebe to nemění** a nemá to vliv na pořadí výsledků: pořadí určuje jen zvolené řazení (cena,
termín, vzdálenost, dny dovolené…), žádná aerolinka ani partner si za lepší místo neplatí.

> Kde v kódu: `server/lib/links.js` (`tp.media`, jen s `TRAVELPAYOUTS_MARKER` a `TRAVELPAYOUTS_TRS`),
> `public/js/trip.js`, `public/js/app.js` (štítek `ad-tag` „reklama“, `rel="sponsored"`), `public/js/about.js`
> (Jak se řadí výsledky).

## 7. Omezení odpovědnosti

- Provozovatel nenese odpovědnost za ceny, dostupnost, změny ani zrušení spojů a ubytování a za plnění smlouvy, kterou
  uzavřeš s prodejcem. Reklamace a vrácení peněz řešíš s prodejcem.
- Provozovatel neodpovídá za škodu vzniklou tím, že se údaj převzatý z veřejného či partnerského zdroje (cena, jízdní
  řád, počasí, vstupní podmínky, otevírací doba, trasa) ukáže jako nepřesný nebo neaktuální.
- Data uložená v aplikaci (cesty, hlídané ceny, kódy rezervací) jsou jen v tvém zařízení. Smazáním dat prohlížeče
  nebo ztrátou zařízení se ztratí – zálohuj si je (⋯ Další → Záloha do souboru).
- Trasy pěšky, na kole a autem jsou návrhy z otevřených dat; nebezpečí na cestě (počasí, uzavírky, sjízdnost)
  posuď sám.
- Tím nejsou dotčena práva spotřebitele, která nelze smluvně vyloučit. [ověřit rozsah – viz Otázky]

## 8. Pravidla používání

Je zakázáno aplikaci zneužívat – zejména automaticky hromadně stahovat data, obcházet limity počtu dotazů nebo
zahlcovat server. Server proto omezuje počet dotazů z jedné adresy a dotazy z cizích webů odmítá.

Obsah, který sdílíš odkazem (cesta, plán, pozvánka), uvidí každý, kdo odkaz má. Nesdílej v něm cizí osobní údaje
bez jejich vědomí.

> Kde v kódu: `server/index.js` `rateLimited()`, `server/lib/security.js` `crossSite()`.

## 9. Licence dat a autorská práva

Letsi používá otevřená data a díla třetích stran pod jejich licencemi:

- **OpenStreetMap** – mapová data © přispěvatelé OpenStreetMap, licence ODbL (podklad map OpenFreeMap © OpenMapTiles,
  hranice oblastí, trasy BRouter, chaty a restaurace přes Overpass, ubytování bez ceny přes Nominatim),
- **GeoNames** – seznam míst, licence CC BY 4.0 (upravený výběr),
- **MET Norway** – předpověď počasí, licence CC BY 4.0 (upraveno na denní souhrny),
- OurAirports (public domain), OpenFlights (ODbL), Wikidata (CC0), Wikipedie (CC BY-SA 4.0), ČSÚ (CC0),
  NOAA a NASA POWER, Twemoji (CC BY 4.0),
- **Mapy.com** – © Seznam.cz, a.s. a další (podle jejich pravidel),
- fotky z Wikimedia Commons, Unsplash a Pexels pod licencemi těchto služeb, s uvedením autora,
- knihovny MapLibre GL JS (BSD-3-Clause), d3, topojson-client a world-atlas (ISC).

Úplný seznam je v README v oddílu Data a licence. Ostatní obsah aplikace (texty, vzhled, kód) je [doplnit – autorské
právo provozovatele / licence repozitáře].

> Kde v kódu: `public/js/about.js` (`SOURCES` a věta o CC BY 4.0), `README.md` (Data a licence, Počasí, Hledání míst),
> `public/js/places.js` (atribuce map).

## 10. Změny podmínek

Podmínky může provozovatel změnit, zejména když se změní aplikace, zdroje dat nebo předpisy. Nové znění zveřejní
v aplikaci s datem účinnosti [doplnit, kde a jak – viz Otázky]. Pokud s novým zněním nesouhlasíš, přestaň aplikaci
používat.

## 11. Rozhodné právo a spory

Tyto podmínky se řídí právem České republiky. Spotřebiteli tím nejsou odňata práva podle předpisů státu, kde má
obvyklé bydliště, pokud jsou pro něj výhodnější.

Spotřebitel může spor řešit mimosoudně u **České obchodní inspekce**, Ústřední inspektorát – oddělení ADR,
Štěpánská 15, 120 00 Praha 2, https://adr.coi.cz. Spor z koupě letenky nebo ubytování řešíš s prodejcem.

Kontakt pro dotazy a stížnosti: [e-mail].

Účinné od: [datum]

---

## Otázky pro advokáta

1. **Vztahuje se čl. 23 nařízení 1008/2008 na Letsi?** Letsi letenky neprodává, jen zobrazuje ceny a odkazuje
   (srovnávač). Pokud ano: aplikace ceny přebírá od zdrojů a **v kódu nelze ověřit, že obsahují všechny nevyhnutelné
   poplatky** – např. administrativní poplatek či poplatek za platbu kartou u Wizz Air, servisní poplatek Kiwi.com,
   poplatek za miminko (Shrnutí výslovně píše „bez poplatku za miminko“). Ceny Travelpayouts jsou až ~48 h staré.
   Stačí upozornění „závazná je cena u prodejce“, nebo je třeba víc (např. věta u každé ceny)?
2. **Zavazadla jako odhad.** Příplatek za zavazadlo je reprezentativní střed z ceníků (`server/lib/baggage.js`,
   „ODHAD … ne ceník“; u některých dopravců `est` – neověřený). Při zvolených zavazadlech je odhad přičtený do
   zobrazené ceny „vč. zavazadel“ a rozpis je jen v popisku. Je to dostatečně „zvlášť a srozumitelně“?
3. **Zdroje dat a jejich podmínky (plán čistého režimu).** V kódu jsou zdroje, jejichž podmínky komerční použití
   neupravují nebo spíš vylučují:
   - **Ryanair a Wizz Air** – neveřejná API jejich webů (`server/providers/ryanair.js`, `wizzair.js`), server se
     představuje hlavičkou běžného prohlížeče (`server/lib/http.js` `BROWSER_UA`); Ryanair proti srovnávačům
     opakovaně žaluje,
   - **Kiwi.com** – veřejný MCP server, podmínky pro neagentní použití nejsou zveřejněné (README),
   - **Xotelo** – neoficiální API nad daty TripAdvisoru (README: „neoficiální API“),
   - **Nominatim, Overpass, BRouter** – veřejné servery s pravidly férového užití,
   - **open.er-api.com (ExchangeRate-API)** – bezplatný tarif vyžaduje atribuci; odkaz „Rates By Exchange Rate API“ je u kurzů v okně země i v ℹ️ O aplikaci,
   Je to s podmínkou čistého režimu (jen zdroje, které komerční použití dovolují) slučitelné? Které zdroje před
   spuštěním vypnout (u Kiwi jde `KIWI_ENABLED=0`)?
4. **Pořadí výsledků a označení reklamy.** Odpovídá informace o řazení § 5 odst. 2 zákona o ochraně spotřebitele
   (hlavní parametry pořadí u srovnávačů) a stačí štítek „reklama“ u partnerských odkazů? Partnerské odkazy se
   aktivují jen s nastavenými proměnnými prostředí – podmínky by měly sedět na obě varianty.
5. **Omezení odpovědnosti vůči spotřebiteli.** Služba je bezplatná a smlouva vzniká jen užíváním webu – jaký rozsah
   omezení obstojí (§ 2898 občanského zákoníku, nepřiměřená ujednání § 1814)? Je vůbec vhodné mluvit o smlouvě
   a „souhlasu používáním“, když uživatel nic nepotvrzuje?
6. **Podpořit (Stripe).** Je dobrovolný příspěvek s volitelnou částkou dar (bez protiplnění)? Jaké daňové a účetní
   povinnosti z toho plynou a má tlačítko nést text „Objednávka zavazující k platbě“ (požadavek v CLAUDE.md platí pro
   platební tlačítko obecně)? Dnes se tlačítko jmenuje „💛 Podpořit Letsi ↗“ a platí se na stránce Stripe.
7. **Zveřejnění a změny.** V aplikaci dnes podmínky ani zásady nejsou – jen okno ℹ️ O aplikaci a soukromí. Kde je
   zobrazit (odkaz v okně, patička na počítači) a jak oznamovat změny, když aplikace nemá účty ani e-maily (jen okno
   Novinky)?
8. **Atribuce licencí.** CC BY 4.0 (GeoNames, MET Norway) a ODbL vyžadují uvedení zdroje. Atribuce map je přímo na
   mapě, ostatní jen v okně ℹ️ O aplikaci. Stačí to?
9. **Licence vlastního kódu.** Repozitář je veřejný; v kořeni není soubor `LICENSE`. Má mít aplikace
   výslovnou licenci, aby šlo v bodě 9 napsat, komu patří kód a texty?
10. **Platformu ODR** EU zrušilo nařízení (EU) 2024/3228 k 20. 7. 2025, proto v textu není. Potvrdit, že stačí ČOI.
