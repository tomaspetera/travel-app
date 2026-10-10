# ATLAS – průzkum živého webu a návrhy na zlepšení (10. 10. 2026)

Živý web https://atlas-letenky.onrender.com, sestavení `7e3ba448e810`. Skutečný Chrome (playwright-core) na mobilu 390×844 a počítači 1300×900, čistý stav prohlížeče; navíc Playwright WebKit 26.6. V kódu ATLASu nebylo nic změněno, nic se neinstalovalo.

**Ostrých hledání: 10** (limit nepřekročen, mezi hledáními pauzy 15–45 s): radar Kdykoliv, radar Víkendy, karta radaru (Londýn), Barcelona flexibilně, kamkoliv z Brna na 2 měsíce, Londýn přesná data, Bangkok, víc měst, 2× kontrolní měření radaru. Části pro WebKit a měření rozložení stránky běžely nad uloženým stavem a uloženou odpovědí, bez dalších ostrých hledání.

Screenshoty: složka `research/ideas-oct10/` (výběr 22 snímků). Všechny snímky, skripty a záznamy jsou na Peterově počítači v `%TEMP%\atlas-qa\ideas\`.

## Nejdůležitější nálezy

1. **Hledání z Přehledu potichu zdědí nastavení z karty radaru** (jen víkendy, 1–3 noci, 1 osoba) – výsledek pak vypadá jako „nejlevnější Barcelona“, ale je to jen výřez. (nález 1)
2. **Radar se načítá 23 s a celou dobu ukazuje jen šedé obdélníky** bez průběhu a bez textu. (nález 2)
3. **Na mobilu není po dohledání vidět žádná nabídka** – první je 866 px pod začátkem průběhu, jedna nabídka má 536 px. (nález 3)
4. **Krok Ubytování ukazuje smyšlené hotely** (testovací klíč LiteAPI), i když boční panel hlásí „Hotely (LiteAPI) živě“. (nález 4)
5. **Wizz Air se u „kamkoliv“ prohledá jen z 10–15 tras z 39** a polovina nejlevnějších cen je z mezipaměti. (nálezy 5 a 6)

## Měřené časy

| Co | Mobil 390×844 | Počítač 1300×900 |
|---|---|---|
| Otevření → stránka načtena (server vzhůru) | 0,6–0,7 s | 0,6–0,7 s |
| Otevření → Přehled s navigací | 1,1–1,9 s | 1,1 s |
| Studený start (spící server) → Přehled | 14,5 s | – |
| Radar Kdykoliv, nové hledání (Brno +200 km) | 23,8 s | – |
| Radar Víkendy, nové hledání | 23,0 s | – |
| Radar, otevření Přehledu vracejícím se uživatelem (Praha, nový dotaz) | 22,3 s od odeslání, karty hned po odpovědi | – |
| Radar, stejný dotaz podruhé během pár minut | 5,7 s | – |
| Přepnutí Kdykoliv ↔ Víkendy z mezipaměti | 0,3 s | 0,06 s (WebKit 0,8 s) |
| Karta radaru → výsledky (Londýn, víkendy) | 10,1 s | – |
| Barcelona flexibilně | 10,2 s | – |
| Kamkoliv z Brna, 2 měsíce, 5–9 nocí | – | 24,5 s (150 destinací) |
| Londýn, přesná data pá–po | – | 5,1 s |
| Bangkok, 3 měsíce, 11–16 nocí | – | 14,2 s |
| Víc měst (Brno → Barcelona → Řím → Brno) | – | 4,0 s |
| Výběr nabídky → průvodce Cesta | 2,0 s | – |
| Cesta: Trasa / Ubytování / Auto / Program / Shrnutí | 3,8 / 12,6 / 3,9 / 20,5 / 5,0 s | – |
| Otevření sdíleného odkazu na cestu (čistý prohlížeč) | 5,4 s (WebKit 1,0 s) | 1,3 s |
| Otevření sdíleného odkazu na plán | 7,3 s (WebKit 0,8 s) | 0,9 s |

Co nejvíc brzdí hledání: Kiwi (22–24 s u „kamkoliv“, 10–14 s u jednoho cíle) a Wizz Air (18–20 s u „kamkoliv“). Ryanair a ostatní jsou hotové do 1–7 s.

Poznámka k měření: první skript ukázal u radaru 84 s. Byla to chyba mého měření ve skrytém okně – čas měřený přímo v prohlížeči je 22–24 s a karty se vykreslí hned po odpovědi.

## Nálezy

Závažnost: **vysoká** = vede ke špatnému rozhodnutí nebo k nepoužitelné části; **střední** = zdržuje nebo mate; **nízká** = kosmetika.

### 1. Hledání z Přehledu zdědí nastavení z předchozího hledání – vysoká
- **Kde:** Přehled → „Kam poletíme?“ → Najít lety (po kliknutí na kartu radaru).
- **Co:** Klikl jsem na kartu radaru v režimu Víkendy (Londýn). Pak jsem se vrátil na Přehled, do KAM napsal Barcelona a dal Najít lety. Odeslalo se: 1–3 noci, odlet jen pá/so, návrat ne/po, 1 osoba, do 24. 11. Výsledek hlásí „Barcelona · nejlevněji 2 413 Kč/os.“ a jediná stopa je drobný text „1–3 nocí · 1 os.“ v záhlaví a „Další možnosti · odlet Pá,So“ ve sbaleném formuláři. Délka pobytu nemá ve formuláři zvýrazněnou žádnou volbu.
- **Návrh:** Hlavní hledání na Přehledu ať vždy vychází z výchozích hodnot (týden, 2 osoby, 2 měsíce), stejně jako dlaždice Rychlé hledání. Případně nad výsledky ukázat odstranitelné štítky „jen víkendy ✕“, „1–3 noci ✕“, „1 os. ✕“.
- **Snímky:** `ideas-oct10/m-12-bcn-vysledky.png`, `ideas-oct10/m-13-lety-formular.png`

### 2. Radar se načítá 23 s bez jakékoli informace – střední
- **Kde:** Přehled → Živý cenový radar (první načtení, přepnutí na Víkendy, Obnovit).
- **Co:** 23–24 s je vidět jen 8 šedých obdélníků. Žádný text, žádný průběh, žádný odhad. Na stránce Lety přitom stejné hledání ukazuje průběh po aerolinkách. Mezipaměť radaru platí 30 minut, takže se to opakuje při každém pozdějším otevření.
- **Návrh:** (a) Pod přepínač dát jeden řádek „Hledám z 10 letišť… Ryanair ✓ · Wizz Air 6/10 · Kiwi…“ – data o průběhu už server posílá. (b) Starý výsledek radaru ukázat hned (i starší než 30 min, s časem „z 13:22“) a na pozadí ho obnovit. (c) Víkendy dohledat na pozadí hned po Kdykoliv, ať je přepnutí okamžité – stojí to ale jedno hledání navíc při každém načtení, takže jen pokud limit stačí.
- **Snímek:** `ideas-oct10/m-03-radar-nacitani.png`

### 3. Na mobilu je první nabídka hluboko pod ohybem a výpis je velmi dlouhý – střední
- **Kde:** Lety → výsledky, mobil.
- **Co:** Po dohledání stránka skočí na kartu průběhu. Ta má 411 px, záhlaví výsledků 173 px, filtry 189 px. První nabídka začíná 866 px pod začátkem průběhu, obrazovka má 844 px – po dohledání tedy není vidět ani cena. Tlačítko „Vybrat a pokračovat“ je 1,5 obrazovky daleko. Jedna nabídka má 536 px, 40 nabídek dá stránku vysokou 24 400 px. Formulář nad tím má 1 251 px, z toho seznam 7 letišť 225 px.
- **Návrh:** Po dohledání sbalit průběh do jednoho řádku („Prohledáno 7 letišť za 10,5 s ▾“) a posunout na záhlaví výsledků. Filtry letišť, aerolinek a ceny schovat na mobilu pod jedno tlačítko „Filtry“. Nabídku na mobilu zkrátit: štítky a rozpis ceny až po rozkliknutí, odkazy „Tam / Zpět / Ověřit“ do jednoho řádku.
- **Snímky:** `ideas-oct10/measure-mobil-po-hledani.png`, `ideas-oct10/m-09-karta-vysledky.png`

### 4. Krok Ubytování nabízí smyšlené hotely – vysoká
- **Kde:** Cesta → Ubytování; boční panel „Zdroje cen“.
- **Co:** Krok ukáže 60 hotelů s cenami a tlačítkem Vybrat, nad nimi varování „Ukázková / testovací nabídka – hotely a ceny nejsou skutečné (demo režim nebo testovací klíč LiteAPI)“. Skoro všechny mají hodnocení 10,0. Boční panel na počítači přitom tvrdí „Hotely (LiteAPI) živě“. Vybraný smyšlený hotel by se započítal do ceny cesty.
- **Návrh:** S testovacím klíčem seznam vůbec neukazovat a nechat jen odkazy na partnery s předvyplněným termínem. V bočním panelu psát „Hotely – ukázka“, ne „živě“.
- **Snímky:** `ideas-oct10/m-21-cesta-stay.png`, `ideas-oct10/chrome-pocitac-prehled.png`

### 5. Wizz Air se u „kamkoliv“ prohledá jen zčásti – střední
- **Kde:** radar, Lety → kamkoliv.
- **Co:** Průběh hlásí „prohledáno 10 nejbližších z 39 tras – zbytek kvůli limitu dotazů“ (u radaru 15 z 39). Tři čtvrtiny tras Wizz Airu z BTS/VIE/BUD tedy ve výsledku chybí nebo jsou jen z mezipaměti. Uživatel to vidí jen v drobné poznámce v průběhu.
- **Návrh:** Zbylé trasy dohledávat postupně na pozadí, dokud je stránka otevřená, a výsledky doplňovat. Nebo si výsledky po trasách pamatovat na serveru pár hodin a při dalším hledání začít od tras, které minule nepřišly na řadu. Nad výsledky napsat „Wizz Air: 10 z 39 tras – Dohledat zbytek“.
- **Snímek:** `ideas-oct10/d-04-kamkoliv-vysledky.png`

### 6. Polovina nejlevnějších cen u „kamkoliv“ je z mezipaměti – střední
- **Kde:** Lety → kamkoliv; průvodce Cesta → Let.
- **Co:** Ze 150 destinací má 78 nejlevnější cenu ze zdroje „Ostatní aerolinky“ (mezipaměť, až 48 h stará), 50 z Kiwi, 17 z Ryanairu, 5 z Wizz Airu. U vybrané Barcelony byla cena z mezipaměti 1 513 Kč, živé nabídky na stejné dny v kroku Let začínaly na 2 023 Kč. Shrnutí cesty i sdílený odkaz dál počítají s 1 513 Kč a posílají na Aviasales.
- **Návrh:** Když živé ověření najde nejlevnější cenu výrazně jinou, napsat to nahoře v kroku Let („Živě teď od 2 023 Kč, o 510 Kč víc – použít?“) a ve Shrnutí označit cenu jako neověřenou. Ve výpisu „kamkoliv“ ověřit živě prvních 5–10 nabídek, případně přidat přepínač „jen živé ceny“.
- **Snímky:** `ideas-oct10/m-20-cesta-let.png`, `ideas-oct10/m-21-cesta-summary.png`

### 7. 🔥 v radaru nic neříká – nízká
- **Kde:** Přehled → radar; začátek výpisu „kamkoliv“.
- **Co:** V radaru Kdykoliv má 🔥 11 z 12 karet, ve Víkendech 9 z 12, na začátku výpisu „kamkoliv“ 11 z prvních 12. Celkově je to přitom rozumné (30 ze 150 destinací) – jen řazení podle ceny vynese nahoru právě ty.
- **Návrh:** V radaru místo 🔥 psát, o kolik je cena pod obvyklou („−78 %“), nebo 🔥 nechat jen 2–3 nejvýhodnějším kartám.
- **Snímek:** `ideas-oct10/m-04-radar-kdykoliv.png`

### 8. „Je to dobrá cena?“ si protiřečí – střední
- **Kde:** výsledky → Je to dobrá cena? (Barcelona).
- **Co:** Nahoře „🔥 Super cena – nejlevnější nabídka do tohoto cíle v tomto hledání“ a „Cena vypadá dobře, není moc důvod čekat“. O odstavec níž: „nejlevnější letenka, co na ní ATLAS zatím viděl: 1 023 Kč/os. Tahle je o 48 % dražší“. Těch 1 023 Kč pochází z dřívějšího hledání téhož dne s jinou délkou pobytu.
- **Návrh:** Paměť cen porovnávat jen pro podobnou délku pobytu a dny v týdnu. Když je aktuální cena výrazně nad nejlevnější viděnou, promítnout to do verdiktu, nebo aspoň napsat, kdy a v jakém hledání byla nižší cena vidět (s odkazem na to hledání).
- **Snímek:** `ideas-oct10/m-14-dobra-cena.png`

### 9. Našeptávač: „Brno“ nabídne Nebrasku dřív než město Brno – střední
- **Kde:** všechna pole Odkud/Kam.
- **Co:** Po napsání „Brno“: 1. letiště Brno-Tuřany, 2. Bruno (Nebraska, USA), 3. Brno (Plzeňský kraj), 4. Brňov, 5. Brno-střed. Město Brno jako takové v nabídce není. U „Londýn“ je druhý London v Kanadě (YXU), před Gatwickem a Heathrow. U „Bangkok“ jsou po správných třech možnostech tři místa na Jávě.
- **Návrh:** Řadit podle velikosti místa a blízkosti k domovu, přesnou shodu názvu před podobnými názvy. Pro Brno, Prahu, Vídeň a Bratislavu mít pevně první položku „město – všechna letiště v okolí“.
- **Snímek:** `ideas-oct10/m-02-domov-naseptavac.png`

### 10. Dálkové lety: nejlevnější nabídky nemají čas příletu ani délku cesty – střední
- **Kde:** Lety → Bangkok.
- **Co:** První dvě nabídky (Air Arabia z Vídně, 11 419 Kč) ukazují „přílet ?“ a „1× přestup“ bez délky cesty a bez délky přestupu. Řazení podle ceny je staví nad nabídky se známou délkou (Air China 14 h 40 min za 11 871 Kč). U dálkového letu je délka přestupu to hlavní.
- **Návrh:** Nabídky bez známé délky u dálkových cílů označit „délka cesty neznámá – ověř“ a prvních pár doověřit přes Kiwi. Přidat řazení „nejlepší poměr cena / délka cesty“.
- **Snímek:** `ideas-oct10/d-12-bangkok-vysledky.png` (je v pohledu Kalendář – pohled se pamatuje z předchozího hledání)

### 11. Odkaz na cestu má 17 216 znaků – nízká až střední
- **Kde:** Cesta → Shrnutí → Zkopírovat odkaz na cestu.
- **Co:** Odkaz na cestu s programem má 17 216 znaků (odkaz na plán 406). Otevřel se správně v Chrome i WebKitu a přenesl celou cestu. Tak dlouhý odkaz ale některé aplikace na zprávy zkrátí nebo neudělají klikací a v SMS je nepoužitelný.
- **Návrh:** Do odkazu nedávat věci, které si příjemce dopočítá sám (nabídky hotelů, alternativní lety, texty „co zařídit“) – jen let, trasu, vybrané body programu a odškrtnuté položky.
- **Snímek:** `ideas-oct10/webkit-mobil-odkaz-na-cestu.png`

### 12. ♡ Hlídat cenu se po uložení nezmění – nízká
- **Kde:** Lety → ♡ Hlídat cenu.
- **Co:** Po uložení ukáže hlášku „Hledání uloženo – cenu hlídám na Přehledu, dokud máš ATLAS otevřený“, ale tlačítko zůstane „♡ Hlídat cenu“. Po zavření hlášky není poznat, že se hledání hlídá. Druhé kliknutí správně odpoví „Tohle hledání už hlídáš“.
- **Návrh:** Po uložení tlačítko přepnout na „♥ Hlídáš – zobrazit na Přehledu“.

### 13. Plánovač: ručně založená cesta do města nepozná zemi – nízká
- **Kde:** Plánovač → Nová cesta → Destinace „Lisabon“.
- **Co:** Cesta se založí bez země (ikona 🧳 místo vlajky) a tlačítko Hledat lety jen otevře prázdný vyhledávač. Cesta uložená z průvodce zemi i let má.
- **Návrh:** Destinaci v Nové cestě zadávat stejným našeptávačem jako ve vyhledávači, tlačítkem Hledat lety pak předvyplnit cíl a termín z cesty.
- **Snímek:** `ideas-oct10/m-25-detail-cesty.png`

### 14. Drobnosti vzhledu a textů – nízká
- Mobil: štítek domova v záhlaví je uříznutý („Brno +200 …“, na stránce Lety „Brno +…“). Stačilo by „📍 Brno“.
- Mobil: v nadpisu radaru se „Obnovit →“ zalomí na dva řádky (šipka sama na druhém).
- Mobil: v průvodci Cesta jsou vidět 3 kroky ze 6 a pod nimi šedý posuvník. Stačily by ikony bez textu, nebo text jen u aktivního kroku.
- „Ubytování v Barcelona“, „Co dělat v Barcelona“ – neskloňuje se. Bezpečnější je „Ubytování · Barcelona“.
- Výsledky si pamatují pohled z minulého hledání: po Londýnu v Kalendáři se Bangkok otevřel rovnou v Kalendáři místo v seznamu.
- U radaru chybí vysvětlení, že cena je za zpáteční letenku včetně dopravy na letiště i z letiště do města. Je to až v patičce pod kartami, pod ohybem.

## Co funguje dobře

- **Žádná chyba v konzoli ani chyba stránky** za celý průchod v Chrome ani WebKitu, žádná odpověď serveru s chybou, žádné přetečení do šířky na 390 ani 1300 px.
- **Rychlý start:** Přehled je s bdícím serverem použitelný do 2 s.
- **Průběh hledání na stránce Lety** je srozumitelný – po aerolinkách, s počty a časy.
- **Přesná data** (Londýn): sloupce Tam / Zpět jako u Google Flights, pruh „Nejbližší dny“ s cenou každého dne (sobota 864 Kč proti pátku 2 987 Kč je vidět na první pohled), 5 s.
- **Víc měst:** předvyplnění druhého letu zpět domů, srozumitelné vysvětlení samostatných letenek a rezerv na přestup, výsledek za 4 s, cena celé cesty se přepočítává podle výběru.
- **Rozpis ceny** u každé nabídky (letenky + doprava na letiště + z letiště do města) a skutečné jízdné z letiště (Aerobús 7,45 €, Stansted Express 9,90 £).
- **Karta radaru** vede na hledání se stejnou cenou, jakou ukazovala (Londýn 1 502 Kč).
- **Přepínač Kdykoliv / Víkendy** se pamatuje, druhé přepnutí je okamžité, u víkendů jsou dny v týdnu. Ve WebKitu vypadá stejně jako v Chrome (2 sloupce na mobilu, 5 na počítači, stejná výška karet).
- **Sdílené odkazy** na cestu i plán se v čistém Chrome i WebKitu otevřou správně, plán má náhled a potvrzení před přidáním, otevření odkazu nespustí žádné hledání.
- **Shrnutí cesty:** vstupní podmínky s datem ověření, seznam co zařídit a co sbalit podle cíle a zavazadla.
- **Filtr Čas a přestupy** filtruje hned bez nového hledání a je dobře popsaný.

## Co se nepodařilo nebo zůstalo neověřené

- U tří hledání z deseti (karta radaru, Bangkok, víc měst) ohlásil Playwright požadavek na hledání jako přerušený, přestože se výsledky normálně zobrazily. S podvrženou odpovědí serveru se to nezopakovalo (jeden požadavek, žádné přerušení). Nevím, jestli je to vlastnost nástroje, nebo server neukončuje odpověď čistě – stálo by za to podívat se do záznamů serveru, jestli u těch hledání nevidí dvojí dotaz.
- Nezkoušel jsem: hledání autem, zavazadla, „Za teplem“, trasu po víc místech v průvodci, export do kalendáře, tisk, světlý režim, stránky Objevuj, Mapa, Země a Doporučení.

## Studený start

Server po 18 minutách klidu opravdu spal. Čistý prohlížeč, mobil 390×844, měřeno ve 13:59:

| Okamžik | Čas od otevření |
|---|---|
| První odpověď (503, probouzecí stránka Renderu) | 0,4 s |
| Server vzhůru, přišla stránka ATLASu | 12,7 s |
| Přehled s navigací použitelný | 14,5 s |

Radar se v čistém stavu nenačítá (není nastaven domov). Vracejícímu se uživateli by se po probuzení přičetlo dalších asi 23 s na radar, celkem tedy zhruba 35–40 s od otevření po karty radaru – to jsem neměřil přímo, je to součet obou měření.

**Nález 15 – při prvním otevření se místo animace ATLASu ukáže stránka Renderu – nízká.** V čistém prohlížeči (bez uložené aplikace) je 12 s vidět šedá stránka „Render – APPLICATION LOADING“ s anglickým výpisem a odkazem „Start building on Render today“. Animace ATLASu se může ukázat až tomu, kdo už má aplikaci uloženou v prohlížeči. Peter ji má, takže se ho to týká jen po vymazání dat nebo v novém prohlížeči; stejně to ale uvidí každý, komu pošle sdílený odkaz. S bezplatným Renderem a bez udržovacích dotazů to odstranit nejde. Snímek: `ideas-oct10/cold-render-stranka.png`
