# ATLAS – nejlevnější letenky odkudkoliv kamkoliv

Cestovní aplikace, která **skutečně hledá letenky**: napíšeš „Brno“, „Vídeň“, „Česko“, „Jihlava“ nebo použiješ polohu,
ATLAS najde všechna letiště v okolí, prohledá je najednou u více aerolinek a ukáže nejlevnější lety **kamkoliv na světě**
(nebo do konkrétního cíle) – včetně ceny cesty na letiště.

Z vybraného letu pak průvodce **Cesta** poskládá celou dovolenou: **let → trasa → ubytování → auto → program → shrnutí**
s celkovou cenou, seznamem, co v jakém pořadí zarezervovat, a časovou osou. Sekce **Objevuj** funguje i samostatně:
zadáš místo a ATLAS najde, co tam stojí za vidění, a rozplánuje to do dnů – jako pěší program ve městě,
**jednodenní výlety** (ráno ven, večer zpět) nebo **vícedenní okruh** s přespáním po cestě, autem i vlakem
a autobusem (čas cesty je odhad, skutečné spoje ukáže odkaz do Google Map u každého úseku). U výletů si zvolíš,
co tě láká – města, památky (hrady, zámky, kláštery), poznávací, přírodu (národní parky, hory, vodopády, jeskyně,
skály), lázně nebo výlety s dětmi. Režim **Na kole** naplánuje okruh zvolené délky (15–130 km) pro silniční,
trekové, gravel nebo horské kolo – městem (přes památky), smíšeně nebo přírodou (lesy, řeky, mimo silnice), po rovině
nebo do kopců. Ukáže délku, stoupání, odhad času, podíl nezpevněných cest a cyklostezek, výškový profil, trasu
v mapě, stáhne GPX a otevře trasu v Mapy.com (turistická mapa) nebo Google Mapách. Varianta **🚆 Vlakem tam, na kole
zpět** najde nádraží ve vzdálenosti podle zvolené délky a naplánuje jízdu domů (spojení vlakem přes IDOS / Google).
Režim **🥾 Pěšky** naplánuje pěší okruh 5–30 km (značené trasy, čas chůze podle DIN 33466). U každého dne výletu i u trasy
je **předpověď počasí** (Open-Meteo) a když má pršet, ATLAS navrhne lepší den; na termíny za víc než 15 dní ukáže
dlouhodobý průměr. Mapa je zdarma a bez klíče (MapLibre + OpenFreeMap, záloha OpenStreetMap) a odkazy do Google Map
hledají místo podle názvu. Plán jde **exportovat do kalendáře** (.ics, Google Kalendář) a **sdílet odkazem**.

K tomu zůstalo vše z původního ATLAS: mapa navštívených zemí, přehled všech 197 zemí s cenovou hladinou, nejlepšími
měsíci, průměrnými teplotami a aktuálními varováními MZV ČR, doporučení podle měsíce a plánovač cest. Nově u každé
země i **vstupní podmínky pro občany ČR** (vízum, ESTA a podobné registrace, občanský průkaz, očkování – viz níže).

## Celá cesta krok za krokem

1. **Let** – v hledání klikneš u letu na *Vybrat a pokračovat*. Let ukáže i přestupy a štítek ceny s odkazem
   *Je to dobrá cena?*. Tlačítkem *Ověřit živou cenu* se dotáže Kiwi.com
   na přesnou cenu a nabídne i jiné aerolinky na stejný termín (low-cost i klasické, přestupy, kombinace).
   U blízkého cíle můžeš místo letu zvolit *🚆 Pojedu vlakem / busem* (viz [Vlak nebo bus místo letadla](#vlak-nebo-bus-místo-letadla)).
2. **Trasa** – celý pobyt na jednom místě, nebo trasa přes 2–4 zajímavá města: ATLAS je navrhne v okolí (autem nebo
   veřejnou dopravou) a rozdělí noci; místa přidáš, odebereš nebo přesuneš a noci upravíš. U každého přejezdu je
   vzdálenost a čas **autem podle skutečné trasy** (s provozem, zácpami ve velkých městech a hraniční kontrolou)
   i **veřejnou dopravou** – vlakem jen tam, kde se mezi městy vlakem jezdí, jinde *autobusem / minibusem* – a přechod
   hranice s odkazem na vstupní podmínky (viz [Přejezdy mezi místy](#přejezdy-mezi-místy)). Trasa začíná u letiště
   příletu (u vlaku/busu ve městě příjezdu) a končí u letiště odletu, i jiného (open-jaw); cesta z posledního místa
   na letiště nebo zpět k vlaku/busu je v časové ose. Ubytování a program pak vybíráš pro každé místo zvlášť.
3. **Ubytování** – nabídky na tvoje data seřazené podle **nejlepšího poměru cena / hodnocení** (hodnocení je očištěné
   o malý počet recenzí, takže 10/10 ze 2 recenzí nepřebije 8,9 z 2 000). Přepneš na nejlevnější, nejlépe hodnocené
   nebo nejblíž centru, filtruješ 7+/8+/9+, typ a max. cenu za noc. U každého místa trasy (i přidaného ručně) jsou
   navíc odkazy na partnery: **Booking.com** (dvakrát – hodnocení 8+ od nejlevnějšího a nejlepší poměr), **Airbnb**,
   **Trip.com**, **Hotels.com**, **Kayak**, **Google Hotels**, **Agoda** a **Hostelworld** předvyplněné na místo, tvoje
   data a počet hostů. U Trip.com, Agody a Hostelworldu k tomu server jednou dohledá jejich vlastní ID místa (v mezipaměti
   30 dní); kde ho partner nemá, zůstane odkaz bez něj – Trip.com vyplní místo a data do formuláře (označeno „potvrď
   Hledat“), Agoda otevře úvodní stránku, Hostelworld stránku města (data zadáš na webu – označeno „zadej data“); místo,
   kde Hostelworld hostely nemá (stránka města chybí nebo hlásí „0 Hostels“ – Lagos, Porto-Novo, Mikulov), dostane
   stránku země s poznámkou „v místě hostely nemá – zkus jinde v zemi“ a až na konci seznamu. Kayak se otevře česky
   a v Kč (cz.kayak.com). Bez klíče LiteAPI zůstanou jen odkazy a cenu zapíšeš ručně.
4. **Auto** (nepovinné) – vyzvednutí na letišti 45 min po příletu, vrácení 2 h před odletem, předvyplněné srovnávače.
5. **Program** – místa k vidění kolem ubytování rozdělená do dnů podle polohy (den příletu a odletu je kratší),
   každý den jako pěší trasa s odkazem do Google Map; volíš zájmy a tempo, místa můžeš vyřadit nebo přidat.
6. **Shrnutí** – cena celkem a na osobu, co zarezervovat a v jakém pořadí, **🛂 Před cestou** (doklady, registrace
   nebo vízum, očkování pro každou zemi cesty), časová osa, uložení do plánovače a odkaz na sdílení.

### Je to umělá inteligence?

Ne. Ceny letenek jsou **skutečné odpovědi API aerolinek a vyhledávačů** (Ryanair, Wizz Air, Kiwi.com, Aviasales).
Nejlevnější kombinace, pořadí hotelů i program dnů počítají **deterministické algoritmy** (optimalizátor kombinací,
bayesovské hodnocení, shlukování míst k-means + trasa nejbližší soused / 2-opt). Místa k vidění a jejich popisy jsou
z Wikidat a Wikipedie. Stejný dotaz tedy dá stejný výsledek a nic si nevymýšlí.

## Vstupní podmínky pro občany ČR

U všech 197 zemí ATLAS ukazuje, co je potřeba k cestě s českým pasem nebo občankou (turistická cesta):

- **Karta země** má malý štítek: 🪪 stačí OP · bez víza · 🛂 ESTA / eTA / ETA (registrace předem) · 🛂 e-vízum ·
  🛂 vízum na hranici · 📄 vízum předem. Seznam zemí jde filtrovat (*Vstup: stačí OP / bez víza a registrace*).
- **Detail země** (🛂 Vstup pro občany ČR): režim srozumitelně česky, max. délka pobytu, jestli stačí OP, požadovaná
  platnost pasu, název a cena registrace / e-víza v € i Kč s odkazem **jen na oficiální web** (žádní zprostředkovatelé),
  povinná a doporučená očkování, poznámky a odkaz na zdroj.
- **Výsledky letů**: štítek jen tam, kde je něco potřeba vyřídit (např. „🛂 ESTA 36 €“, podrobnosti v bublině).
  U cesty přes víc měst je štítek u letu do země a – když další let odlétá z jiné země (tam do Turecka, zpět
  z Egypta) – i u letu z ní.
  Když spoj **přestupuje v USA nebo Kanadě**, upozorní „✈︎ přestup v USA – i tranzit vyžaduje ESTA“; při přestupu
  **ve Velké Británii** „s pasovou kontrolou nutná ETA“ (podle MZV stačí bez ETA jen tranzit bez opuštění tranzitního
  prostoru – u samostatných letenek se ale obvykle prochází kontrolou). Země přestupu se bere z databáze letišť
  (Portoriko a další území USA platí jako USA); jiné země takové pravidlo v datech nemají.
- **Průvodce cestou a plánovač**: seznam 🛂 Před cestou pro každou zemi cesty (i cesty přes víc měst nebo míst)
  a pro země, kde jen přestupuješ a registrace platí i pro tranzit („jen přestup“) – doklady s datem, do kdy musí
  pas platit (počítáno od návratu, např. „pas platný aspoň do 14. 6. 2027“; když zdroj lhůtu jen doporučuje, píše
  „doporučená platnost“, a u „po dobu pobytu“ datum nepočítá), registrace či vízum s odkazem a předstihem, očkování.
  Poplatky (ESTA atd. × počet cestujících, i za přestup v USA) jsou ve shrnutí jako zvláštní řádek pod součtem
  („Celkem i se vstupními poplatky“). Export do kalendáře (.ics) přidá připomínku „🛂 Vyřídit ESTA (USA)“ 14 dní
  před odletem (u víza 30 dní, déle, když data uvádějí delší vyřízení). Sdílené odkazy nesou jen kódy zemí
  (a zemí přestupu), podmínky se dopočítají z dat.
- **Neověřené záznamy** (3 země) mají u štítku „?“ a v detailu i seznamu upozornění, ať je bereš jen orientačně.
- **Dočasné režimy** (Jižní Korea bez K-ETA, Bělorusko a Mongolsko bez víza – vše zatím do 31. 12. 2026): když cesta
  vychází později, ukáže let štítek „⏳ ověř vstup“ a seznam Před cestou upozornění.

**Zdroj a stav:** MZV ČR – Informace pro cestovatele (Encyklopedie států, „Víza a vstupní režim“), u registrací
a e-víz oficiální weby cílových zemí, u očkování seznamy WHO a CDC; ověřeno **10/2026** (194 ze 197 zemí přímo na
oficiální stránce, neověřené jsou označené). **Je to informativní přehled** – pravidla se mění a ATLAS za ně neručí;
před cestou si podmínky vždy ověř na [webu MZV ČR](https://www.mzv.gov.cz/jnp/cz/cestujeme/index.html) a u úřadů
cílové země.

**Aktualizace dat:** nahraď `data/entry.json` (stejná pole: `iso2`, `visa` = `none | eu | eta | evisa | voa | visa`,
`idCard`, `maxStayDays`, `etaName`, `etaCostEur`, `etaUrl`, volitelně `transitEta` (`true` = registrace i pro
letištní tranzit, `"landside"` = jen při přestupu s pasovou kontrolou), `passportValidity`,
`vaccinesRequired`, `vaccinesRecommended`, `notes`, volitelně `validUntil` (do kdy dočasný režim platí, YYYY-MM-DD),
`source`, `verified`; nahoře `checked` = měsíc ověření) a spusť
`npm test`. Test `test/entry.test.js` zkontroluje, že jsou všechny země z `data/countries.json`, hodnoty, https odkazy,
délku poznámek, žádné HTML a že odkazy na registrace nevedou na zprostředkovatele (nový nevládní web je potřeba
ručně ověřit a doplnit do seznamu v testu). Prohlížeč si soubor načítá zvlášť (`/data/entry.json`, gzip, cache 1 h)
až po startu, takže nezdržuje první vykreslení.

## Před cestou: co zařídit a co sbalit

Ve shrnutí průvodce cestou je pod „🛂 Před cestou“ karta **🧭 Co zařídit a co sbalit** – praktický checklist
a seznam věcí na míru cestě (země, termín, doprava, zavazadla z hledání, auto, program):

- **🛡️ Cestovní pojištění** – vždy (MZV: bez pojištění léčebných výloh nedoporučuje vůbec vycestovat). Mimo EU, EHP,
  Švýcarsko a Velkou Británii s důrazem: ošetření se platí na místě a česká zdravotní pojišťovna proplatí jen
  neodkladnou péči, nejvýš do výše českých cen; pojištění kryje i převoz domů a asistenční službu. V EU kvůli
  spoluúčasti, převozu a asistenci, které EHIC nekryje. Když vstupní podmínky pojištění vyžadují (Bělorusko
  min. 10 000 EUR, Gruzie, Tanzanie, Kuba, Rusko, Chile…), ukáže příslušnou větu z dat „🛂 Před cestou“; u turistiky
  a hor připomene ověřit krytí sportovních úrazů. Žádné odkazy na pojišťovny.
- **💳 EHIC** (Evropský průkaz zdravotního pojištění) – země EU, EHP, Švýcarsko a Velká Británie: lékařsky nezbytná
  péče za stejných podmínek jako místní (se spoluúčastí), nekryje převoz domů a cestovní pojištění nenahrazuje.
  Smluvní státy jen nutná a neodkladná péče: Srbsko a Černá Hora (s EHIC na pobočku místního fondu, formulář INO-1),
  Severní Makedonie (EHIC přímo u lékaře), Turecko, Albánie a Tunisko (formulář CZ/TR 111, CZ/AL 111, CZ/TN 111 od
  pojišťovny), Bosna a Hercegovina (doklad ověř u pojišťovny).
- **📝 DROZD** – dobrovolná registrace u MZV pro cesty mimo EU/Schengen a do zemí s bezpečností ≤ 3 (hodnota
  `safety` z `data/countries.json`); u bezpečnosti 1–2 jako důležité s odkazem na upozornění MZV. Text uvádí, k čemu
  registrace je (varování e-mailem/SMS, pomoc při mimořádné události, výmaz 30 dní po návratu, i v aplikaci Portál
  občana) a nouzovou linku MZV +420 222 420 222.
- **🚗 Řidičský průkaz** – jen když cesta počítá s autem na místě (vybrané auto, nebo trasa autem přes víc míst).
  V EU a EHP stačí český ŘP; jinde podle tabulky níže (MŘP = mezinárodní řidičský průkaz, vzor 1949 podle Ženevské,
  vzor 1968 podle Vídeňské úmluvy). Když země v tabulce není, napíše „neověřeno – ověř na webu MZV (Doklady)“ a podle
  seznamů OSN doplní, které úmluvě je země stranou (tedy jaký vzor MŘP by měla uznávat), nebo že není stranou žádné.
  Z dokladů spočítá, jaký vzor vyřídit (USA + Vietnam = oba vzory, dva průkazy) a jak: obecní úřad obce s rozšířenou
  působností, na počkání, 200 Kč, řidičák, doklad totožnosti a fotka 3,5 × 4,5 cm; vzor 1949 platí 1 rok, 1968 3 roky.
- **🔌 Zásuvky a napětí** pro 195 zemí: typy zásuvek, napětí a frekvence a jestli pasují české zástrčky (typ E/F),
  jen ploché dvoukolíkové „europlug“ (typ C), nebo je potřeba adaptér (USA a Japonsko = jeden adaptér A/B);
  u 100–127 V upozornění, že fungují jen spotřebiče se štítkem 100–240 V.
- **💶 Měna** – česky podle kódu měny země (Intl). Jestli se dá platit kartou, ATLAS neuvádí – na to není spolehlivý
  souhrnný zdroj.
- **💉 Očkování** – připomene poradit se s lékařem, když vstupní podmínky uvádějí povinná nebo doporučená očkování.
- **🎒 Co sbalit** – skupiny *Doklady a peníze*, *Zdraví a hygiena*, *Oblečení*, *Na výlety, pláž a hory*,
  *Elektronika*. Podle **podnebí v měsících cesty** u každého místa trasy (NASA POWER, průměrná denní maxima a minima,
  srážky: horko → lehké oblečení, pokrývka hlavy, opalovací krém; chlad a mráz → bunda, čepice, termoprádlo; období
  dešťů → nepromokavá bunda, jinak deštník; v mrazu bez deštníku), **délky cesty** (prádlo nejvýš na 7 dní, déle
  praní), **dopravy a zavazadel** z hledání (jen pod sedadlo / kabinový kufr / kufr k odbavení: tekutiny do 100 ml,
  powerbanka jen do kabiny; s malým zavazadlem na delší cestu „bal na vrstvy“ jen v chladu, při velkém rozdílu dne
  a noci, na horách nebo na sněhu – ve stálém horku ne; vlak/bus jízdenky), **dokladů** (občanský průkaz, nebo pas
  s datem platnosti; potvrzení ESTA, eTA, e-víza), **zdraví** (repelent a antimalarika jen podle doporučených očkování
  a v teple, očkovací průkaz u žluté zimnice), **auta** (řidičák, MŘP) a **aktivit**: 🏖️ pláž, 🥾 turistika, 🏙️ města,
  ⛷️ sníh – výchozí výběr podle programu (kategorie míst), štítků země a podnebí, přepíná se čipy; u kostelů a chrámů
  v programu oblečení zakrývající ramena a kolena.
- **Vlastní položky** – pole „Přidat vlastní položku…“ pod seznamem věcí. Položky (nejvýš 30 po 80 znacích, bez HTML)
  jsou součástí cesty (`pretrip.custom`), dají se smazat (✕) a tisknou se se seznamem.
- **Odškrtávání** se ukládá v prohlížeči, pro každou cestu zvlášť (`localStorage` `atlas_pretrip_v1`, posledních
  30 cest; zakázané úložiště nevadí). Sdílený odkaz `#trip=` nese zvolené aktivity, vlastní položky i odškrtnutí
  (`pretrip.acts`, `pretrip.custom`, `pretrip.done`); po otevření se odškrtnutí uloží k nové cestě příjemce (jeho
  ostatní cesty zůstanou beze změny). Z odkazu projdou jen známé aktivity, pročištěné položky a id ve známém tvaru
  (nejvýš 200); starší odkazy bez těchto polí fungují dál. **💾 Uložit do plánovače** převezme úkoly a věci (i
  s odškrtnutím a vlastními položkami) do seznamu „Sbaleno“ místo obecného seznamu – a tím i do sdíleného plánu
  `#plan=`: odškrtnutí nese volitelné pole `done` (bitová maska šestnáctkově, 80 položek = nejvýš 20 znaků); verze
  formátu zůstává 1 a starší odkazy fungují dál (vše neodškrtnuté).
- **🖨️ Vytisknout** vytiskne jen tuto kartu (seznam věcí ve dvou sloupcích se zaškrtávátky); tisk celé stránky skryje
  navigaci a tlačítka.
- **📅 Do kalendáře** (.ics) přidá připomínky „🛡️ Sjednat cestovní pojištění“ (14 dní před odjezdem), „🚘 Vyřídit
  mezinárodní řidičský průkaz“ (21 dní, jen když je nutný) a „📝 Registrace v systému DROZD“ (3 dny, když se
  doporučuje); připomínka, která by vyšla do minulosti, se posune na dnešek.

**Řidičský průkaz podle MZV (stránky zemí „Doklady“ a „Specifika“, 71 zemí):**

| Co platí | Země |
| --- | --- |
| stačí český ŘP | EU a EHP, Švýcarsko, Velká Británie (do 12 měsíců, gov.uk), Argentina, Bělorusko, Bosna a Hercegovina, Grónsko, Izrael, Kosovo, Maroko, Mauricius, Monako, Omán, Paraguay |
| MŘP doporučen | vzor 1949: Alžírsko, Dominikánská republika, Guatemala, Chile, Jamajka, Kanada, Venezuela · vzor 1968: Arménie, Saúdská Arábie, Turkmenistán · kterýkoli: Albánie, Černá Hora, Thajsko (MZV: motorku bez MŘP nepůjčovat), Zimbabwe · vzor neuveden: Bolívie, Jemen |
| nutný MŘP (s českým ŘP) | vzor 1949: Bangladéš, Botswana, **Japonsko** (vzor 1968 neplatí), Jižní Korea, Jordánsko, Lesotho, Libanon, Madagaskar, Malawi, Namibie, Singapur, **USA** (jen vzor 1949) · vzor 1968: Brazílie, Írán, Katar, Kuvajt, Maledivy, Nepál, Tádžikistán, Uruguay, **Vietnam** · kterýkoli: Bahrajn, **Egypt**, Jihoafrická republika, **SAE**, Uzbekistán · vzor neuveden: Angola, Eswatini, Kolumbie, **Mexiko** (půjčovny), Mosambik, Zambie |
| český ŘP s úředním překladem, nebo MŘP | Austrálie, Nový Zéland (vzor 1949), Gruzie, Kyrgyzstán, Kazachstán |
| nutné místní povolení | Čína, Etiopie, Kambodža (český ani MŘP neplatí), Srí Lanka (MŘP 1949 + „Recognition Permit“), Grenada (dočasné povolení na základě MŘP) |
| neověřeno → „ověř“ | ostatní, mj. Turecko, Indonésie, Indie, Peru, Srbsko, Ukrajina, Tunisko (s nápovědou podle úmluv OSN) |

**Zdroje a stav (ověřeno 10/2026):**

- DROZD: [drozd.mzv.gov.cz](https://drozd.mzv.gov.cz/) a [MZV – DROZD](https://mzv.gov.cz/jnp/cz/cestujeme/drozd/index.html);
  pojištění, kopie dokladů, léky, kontaktní osoba a nouzová linka: [MZV – Desatero na cesty](https://mzv.gov.cz/jnp/cz/cestujeme/uzitecne_informace_pri_cestach/desatero_na_cesty.html)
  (aktualizováno 9. 10. 2025); [MZV – upozornění na cesty](https://mzv.gov.cz/jnp/cz/cestujeme/aktualni_doporuceni_a_varovani/index.html).
- EHIC a smluvní státy: Kancelář zdravotního pojištění – [Pobyt mimo ČR (turisté)](https://kancelarzp.cz/pobyt-mimo-cr-turiste-studenti/),
  [Na jakou péči mám nárok](https://kancelarzp.cz/zdr-pojisteni-a-pece-v-eu-a-smluvnich-statech/na-jakou-peci-mam-narok/),
  [Cestovní pojištění](https://kancelarzp.cz/zdr-pojisteni-a-pece-v-eu-a-smluvnich-statech/cestovni-pojisteni/) a
  [podmínky v jednotlivých státech](https://www.kancelarzp.cz/app/); [VZP – Evropský průkaz zdravotního pojištění](https://www.vzp.cz/pojistenci/cestovani-a-pobyt-v-zahranici/evropsky-prukaz-zdravotniho-pojisteni);
  [MZd – nárok na péči v zahraničí](https://mzd.gov.cz/narok-na-cerpani-zdravotnich-sluzeb-ceskymi-pojistenci-v-zahranici/).
- Mezinárodní řidičský průkaz: [Portál veřejné správy – Vydání MŘP](https://portal.gov.cz/sluzby-vs/vydani-mezinarodniho-ridicskeho-prukazu-S94)
  (vzory, platnost, poplatek, kde); požadavky jednotlivých zemí ze stránek MZV *Encyklopedie států → Cestování →
  Doklady / Specifika* (odkaz u každé země v kartě); Velká Británie [gov.uk](https://www.gov.uk/driving-nongb-licence);
  smluvní strany úmluv: OSN – [Ženevská úmluva 1949](https://treaties.un.org/Pages/ViewDetailsV.aspx?src=TREATY&mtdsg_no=XI-B-1&chapter=11&lang=en)
  a [Vídeňská úmluva 1968](https://treaties.un.org/Pages/ViewDetailsIII.aspx?src=TREATY&mtdsg_no=XI-B-19&chapter=11&Temp=mtdsg3&clang=_en)
  (jen ratifikace nebo přístup, pouhý podpis se nepočítá).
- Zásuvky a napětí: [Mains electricity by country](https://en.wikipedia.org/wiki/Mains_electricity_by_country)
  (Wikipedie, CC BY-SA 4.0; vychází z přehledu IEC World Plugs, který IEC mezitím ze svého webu stáhla); u 29 zemí,
  kde napětí nebo zásuvky zmiňuje MZV (např. Japonsko 100 V, USA 110–120 V, Keňa a Tanzanie britský typ), porovnáno
  s texty MZV – sedí kromě Ekvádoru (MZV píše 220 V, ponecháno 120 V). Jižní Súdán a Marshallovy ostrovy v přehledu
  nejsou („ověř“).
- Podnebí: `data/climate.json` (NASA POWER, viz níže), vstupní podmínky a očkování: `data/entry.json`.

**Je to informativní přehled** – pravidla se mění, ATLAS za ně neručí; karta vždy odkazuje na oficiální zdroj.
**Aktualizace dat:** `public/data/pretrip.json` (statický soubor, prohlížeč ho načte až u shrnutí): `checked`,
`sources`, `phones`, `health.ehic` (země EHIC), `health.contract` (smluvní státy: text), `eea`, `driving`
(`n` = `ok | rec | req | transl | local`, volitelně `f` = `1949 | 1968 | any`, `t` = poznámka, `s` = zdroj),
`conv` (strany úmluv: `1949 | 1968 | both`), `plugs` (`t` typy, volitelně `m` hlavní typ pro adaptér, `v` napětí,
`hz`). `npm test` (`test/pretrip.test.js`) zkontroluje kódy zemí, hodnoty, https zdroje (u řidičáků jen MZV nebo
gov.uk), že v textech není HTML, a pravidla (Japonsko + auto → MŘP 1949, Itálie → stačí český ŘP, Bělorusko →
pojištění jako podmínka vstupu, EU → EHIC, mimo EU → DROZD, zima → teplé oblečení, pláž v horku → plavky a opalovací
krém…).

## V čem je lepší než Skyscanner

| | ATLAS |
|---|---|
| **Odlet odkudkoliv** | Zadáš město, obec, zemi nebo polohu → prohledá *všechna* letiště v okruhu (např. z Jihlavy PED, BRQ, PRG, VIE, BTS, LNZ…). Letiště lze ručně vyřadit. |
| **Cena včetně cesty na letiště** | Ke každé letence přičte odhad cesty na letiště a zpět – 🚌 veřejnou dopravou (vlak/bus do města letiště + MHD na letiště + příplatek za spoj přes hranici), nebo 🚗 autem (nafta, benzín nebo nabíjení elektroauta za aktuální ceny, parkování podle délky cesty, dálniční známky). Let z Vídně za 600 Kč tak férově porovná s letem z Brna za 900 Kč. Viz [Doprava na letiště](#doprava-na-letiště). |
| **Kamkoliv z více letišť** | Jedno hledání = všechny destinace ze všech letišť v okolí, seskupené podle města (Londýn = STN + LTN + LGW…). |
| **Dálkové lety** | Cílem může být i světadíl (Asie, Afrika, Blízký východ, Amerika, Oceánie). Do vzdálených zemí se hledá i z velkých přestupních letišť v okolí (Vídeň, Mnichov, Berlín…) – cena cesty na ně je započtená. |
| **Kombinace, které jinde nenajdeš** | Tam s Ryanairem, zpět s Wizz Air. Odlet z Vídně, návrat do Bratislavy. Přílet do Bergama, odlet z Malpensy. Optimalizátor skládá i takové cesty. |
| **Víc měst v jedné cestě** | *🗺️ Víc měst*: 2–4 lety jedním směrem (třeba Praha → Řím, Neapol → Praha), každý na přesné datum ± 0–3 dny; rychlá volba *↩ Návrat z jiného města*. Každý let se hledá zvlášť a ATLAS skládá jen lety, které na sebe navazují: na stejném letišti aspoň 3 h, z jiného letiště téhož města 5 h, z jiného města nejdřív další den a aspoň 8 h po příletu. Ve výsledku vybíráš let po krocích (nenavazující lety zešednou s důvodem), vidíš nejlevnější kombinace a ke každému letu tlačítko Koupit – jsou to samostatné letenky. Dva lety tam a zpět domů pokračují do průvodce cestou, delší cesta se uloží do plánovače i s lety v kalendáři (.ics). |
| **Kalendář celých cest** | V režimu konkrétního cíle ukáže pro každý den nejlevnější *celou cestu tam a zpět* (se zadaným počtem nocí), ne jen jednosměrný let. |
| **Přesná data i flexibilně** | *📅 Přesná data*: zadáš den odletu a návratu a hledá se jen v tyto dny (volitelně ±1–3 dny). Pohled *✈︎ Lety* ukáže jako Google Flights všechny nalezené lety tam a zpět zvlášť (čas, aerolinka, přímý / s přestupem, cena celé cesty, další odlety dne bez ceny), pruh *📅 Nejbližší dny* ceny ±3 dny kolem data a jedním kliknutím hledá jiný den. *🔀 Flexibilně*: rozsah dat odletu + počet nocí, víkendy (čt/pá/so → ne/po), prodloužené víkendy, vlastní dny v týdnu. |
| **Čas a přestupy** | Filtr *🕐 Čas a přestupy* ve výsledcích filtruje hned, bez nového hledání: čas odletu tam i zpět (ráno 5–12, odpoledne 12–18, večer 18–24, v noci 0–5 h, víc najednou), přílet nejpozději do 18 / 20 / 22 h nebo před půlnocí (přílet v noci 0–5 h se počítá jako pozdní, ráno dalšího dne ne), jen přímé lety nebo max. 1 přestup, max. délka cesty jedním směrem a nejdelší přestup (posuvníky podle nalezených letů). Časy jsou místní časy letišť. Platí v seznamu, na mapě, v kombinacích, v kalendáři i ve sloupcích ✈︎ Lety – tam jen pro svůj směr (když chceš návrat ráno, zůstanou všechny lety tam a každý se spáruje s nejlevnějším ranním návratem jako dvě samostatné letenky). U přesných dat se takhle skládají i filtry pro oba směry (*Jen přímé*, přílet, délka, přestup): když server poslal jen nejlevnější dvojice s přestupem jedním směrem, ATLAS spáruje přímé lety tam a zpět sám – ve sloupcích, v kombinacích i v kalendáři, s poznámkou, že jde o dvě samostatné letenky. Aktivní filtry jsou čipy s počtem skrytých nabídek a ✕, chytrá nápověda je nabídne zrušit. Lety bez známého času, délky nebo časů přestupů se neskrývají. U letů s přestupem je vidět, kde a jak dlouho se čeká („1× přestup (MUC 1 h 35 min)“). |
| **Chytrá nápověda** | Když je výsledků málo nebo žádné, nabídne konkrétní úpravy jedním kliknutím (± dny, přestupní letiště – ne v zemi cíle ani hned vedle něj, celá země / světadíl, jen tam, celý měsíc, zrušit filtr) a průvodce *💡 Jak hledat chytře* pro dálkové lety. Aktivní filtry jsou vidět jako čipy s ✕, výpadek Kiwi.com hlásí s tlačítkem *Zkusit znovu*. |
| **Skóre výhodnosti** | 🔥 Super cena / 👍 Výhodné podle vzdálenosti a ostatních výsledků, ↓ zlevnění (Ryanair posílá předchozí cenu), ☀️ ideální sezóna z dat ATLAS. |
| **Je to dobrá cena?** | U každé nabídky štítek 💚 Dobrá cena / Běžná cena / 🔺 Dráž než obvykle a panel s vysvětlením: srovnání s ostatními nabídkami do stejného cíle v tomto hledání, s průměrnou cenou na vzdálenost a s tím, co ATLAS na trase viděl dřív (trend ↓ / → / ↑), plus opatrná rada, jestli koupit, nebo cenu hlídat – viz [Je to dobrá cena?](#je-to-dobrá-cena). |
| **Vlak nebo bus místo letadla** | U blízkých cílů v Evropě odhad cesty vlakem/busem, srovnání s letadlem od dveří ke dveřím a na vyžádání skutečné spoje RegioJetu s cenami; FlixBus, IDOS a Google Mapy jako odkazy. |
| **Mapa výsledků** | Všechny destinace na mapě obarvené podle ceny. |
| **Kam za teplem** | Volba 🌡️ Za teplem (≥ 20 / 25 / 30 °C) pustí jen cíle, kde je v měsíci odletu dlouhodobě aspoň tolik stupňů (NASA POWER, průměr 2001–2020). U každé nabídky je štítek s teplotou a řazení „Nejtepleji“. |
| **Cena i se zavazadly** | 🧳 Zavazadla (kabinový kufr / kufr k odbavení) přičte odhad poplatku podle dopravce (~95 aerolinek, ověřeno na jejich webech 10/2026) – nízkonákladovky se tak férově porovnají s klasickými aerolinkami. |
| **Hlídání cen + živý radar** | Ulož hledání ♡ a nastav cílovou cenu. Dokud máš ATLAS otevřený v prohlížeči, kontroluje ho sám zhruba jednou za 6 h, kreslí vývoj ceny a při zlevnění o 3 % nebo pod cílovou částku se ozve (i upozorněním prohlížeče). Stejné hledání (stejný dotaz – nezáleží na pořadí míst) se hlídá jen jednou: uložíš-li ho znovu (♡ pod formulářem i v *Je to dobrá cena?*), jen se mu aktualizuje cena a panel ukáže *✓ Tohle hledání už hlídáš*. Radar ukazuje nejlevnější lety z tvého okolí na příštích 6 týdnů. |

## Odkud bere ceny

| Zdroj | Co dává | Klíč |
|---|---|---|
| **Ryanair** (Fare Finder API webu ryanair.com) | živé ceny, „kamkoliv“ jedním dotazem na letiště, ceny po dnech | není potřeba |
| **Wizz Air** (API webu wizzair.com – mapa tras + `timetableV2`) | živé ceny po dnech na trasách | není potřeba |
| **Kiwi.com** (veřejný MCP server `mcp.kiwi.com`) | živé ceny všech aerolinek (low-cost i klasické, přestupy, kombinace různých aerolinek) – do konkrétního cíle, do zemí a světadílů (dotaz na každou oblíbenou zemi), „kamkoliv“ (Evropa + dálkové země) a při ověření vybraného letu | není potřeba |
| **Travelpayouts / Aviasales Data API** | všechny ostatní aerolinky (i s přestupy, dálkové lety), ceny z vyhledávání uživatelů za posledních ~48 h | **zdarma** token z [travelpayouts.com](https://www.travelpayouts.com/) |
| **LiteAPI** (ubytování) | hotely s cenou na zadané dny, hodnocením hostů a fotkou | **zdarma** klíč z [liteapi.travel](https://www.liteapi.travel/) |
| **Wikidata + Wikipedie** (program) | místa k vidění, typ, význam, fotky, české popisy | není potřeba |
| **ČSÚ + Weekly Oil Bulletin EU** (cesta autem na letiště) | týdenní ceny nafty a Natural 95 v Česku a sousedních zemích; elektroauto podle ceníků nabíjení – viz [Aktuální ceny paliva a nabíjení](#aktuální-ceny-paliva-a-nabíjení) | není potřeba |

> Amadeus Self-Service API bylo v červenci 2026 vypnuto a Kiwi Tequila ani Skyscanner API nepřijímají nové vývojáře
> (Kiwi.com je proto napojené přes svůj veřejný MCP server; jeho podmínky pro neagentní použití nejsou zveřejněné –
> kdyby ho Kiwi omezilo, vypne se `KIWI_ENABLED=0` a zbytek běží dál),
> proto ATLAS staví na zdrojích výše. Adaptéry jsou oddělené (`server/providers/`), další zdroj se přidá jedním souborem.

Ceny Ryanair a Wizz Air jsou živé, ale do rezervace se mohou změnit; ceny z Travelpayouts jsou označené „⏱ z cache – ověř“
(ve výpisu, ve sloupcích ✈︎ Lety i v krocích „Víc měst“) a je dobré je ověřit (u každého výsledku je odkaz na rezervaci
a na ověření v Google Flights / Skyscanneru). U letů s přestupem z cache bývá uvedená délka kratší, než je možné
(nejspíš jen čas ve vzduchu bez přestupu) – když nestačí na přímý let (+10 %) a 80 min na každý přestup, ATLAS délku ani
přílet nedopočítává: ukáže „přílet ?“, filtry času je neskrývají a „Víc měst“ na takový let naváže další nejdřív 24 h po jeho odletu.

## Je to dobrá cena?

U každé nabídky letenky je štítek **💚 Dobrá cena**, **Běžná cena** nebo **🔺 Dráž než obvykle** (u nejlepších nabídek **🔥 Super cena**). Kliknutím na štítek nebo na odkaz „Je to dobrá cena?“ se otevře vysvětlení – u výsledků, u vybrané cesty v pohledu ✈︎ Lety i v průvodci cestou v kroku Let. Panel ukazuje:

- **Oproti ostatním nabídkám do stejného cíle v tomto hledání**: pozice ceny mezi všemi nalezenými nabídkami (ne jen zobrazenými) – nejlevnější, čtvrtina nejlevnějších, medián, rozpětí dat.
- **Oproti průměrné ceně na tuto vzdálenost**: hrubé pravidlo podle kilometrů. Výhodná je letenka zhruba od 40 % pod průměrem, dražší než obvykle od 25 % nad ním. Když je nabídek k porovnání méně než 5, řídí se odhad jen tímhle pravidlem a řekne to.
- **Co ATLAS na této trase viděl**: prohlížeč si pamatuje nejlevnější letenku z každého hledání podle trasy (letiště → město, měsíc odletu, zpáteční / jen tam) a kdy ji viděl. Při opakovaném stejném hledání (aspoň po 6 h, třeba při hlídání ♡) ukáže trend ↓ / → / ↑. Paměť je jen v tomto prohlížeči (localStorage), drží nejvýš 300 tras a zapomíná minulé měsíce a trasy neviděné přes 120 dní.
- **Do odletu** a opatrná rada: nízká cena krátce před odletem → spíš koupit; víc než ~7 týdnů do odletu → hlídat cenu ♡ s cílovou cenou; jinak zkusit jiné dny nebo letiště. Ceny u nízkonákladovek se před odletem obvykle zvedají.

Je to odhad, ne předpověď: porovnává se cena letenek na osobu bez dopravy na letiště a zavazadel.

## Doprava na letiště

K ceně letenek ATLAS přičítá odhad cesty z domova na letiště odletu a zpět, na osobu – letiště 300 km daleko tak férově
porovná s tím za humny. V *Další možnosti → Doprava na letiště* zvolíš **Na letiště: 🚌 veřejnou dopravou** (výchozí)
nebo **🚗 autem**, případně dopravu nezapočítáš vůbec. Vždy je to odhad (`server/lib/access.js`), ne jízdní řád ani
ceník parkoviště; hledání se kvůli němu na síť neptá (jen ceny paliva se stahují jednou denně na pozadí – viz
[Aktuální ceny paliva a nabíjení](#aktuální-ceny-paliva-a-nabíjení)).

**🚌 Veřejnou dopravou** (na osobu a jeden směr, zpět totéž):

- **Letiště ve tvém městě** → jízdenka MHD (Praha: bus 59 nebo 100 + metro, PID na 90 min 50 Kč, v aplikaci 46 Kč
  → ~50 Kč; Airport Express za 200 Kč se nepočítá – pid.cz 6. 10. 2026; Brno: IDS JMK ~30 Kč).
- **Letiště jinde** → vlak / bus do města letiště **+** cesta z města na letiště **+** příplatek za mezinárodní spoj.
  Vlak / bus: model podle vzdálenosti kalibrovaný na nejnižších cenách RegioJetu a FlixBusu (Praha ↔ Vídeň, Berlín,
  Mnichov, Budapešť, Krakov… změřeno, viz [Vlak nebo bus místo letadla](#vlak-nebo-bus-místo-letadla)); na kratší
  vzdálenost regionální jízdné ~30 Kč + 1,5 Kč/km. Z města na letiště: tabulka ~35 letišť do ~450 km od Česka (MHD,
  S-Bahn, letištní bus – např. Vídeň vlak S7 ~110 Kč, Mnichov S-Bahn ~350 Kč, Berlín ~120 Kč, Drážďany ~85 Kč,
  Budapešť bus 100E ~170 Kč; Memmingen = letištní bus z Mnichova), jinde jízdenka MHD země + 20–40 Kč podle velikosti
  letiště. Příplatek přes hranici: mezi Českem, Slovenskem, Polskem a Maďarskem 30 Kč, jinak 20 % jízdného (aspoň
  50 Kč) – na letiště jedeš konkrétním spojem v danou hodinu, ne nejlevnější akční jízdenkou.
- **Přímý bus až na letiště** z Prahy do Mnichova, Vídně a Berlína a z Brna do Vídně se počítá místo cesty přes město,
  když vyjde levněji (ceny změřené 6. 10. 2026: Praha → letiště Mnichov RegioJet 1× denně 299–499 Kč, FlixBus
  449–479 Kč; Vídeň od 369 Kč, Berlín BER od 419 Kč, Brno → Vídeň od 249 Kč; Mnichov přes město a S-Bahn ~710 Kč).
- **Změřená cesta do města letiště**: Praha → Drážďany busem FlixBus 319–339 Kč, RegioJet 369 Kč (vlak ČD / DB
  623–647 Kč; 6. 10. 2026) → počítá se 340 Kč + S-Bahn ~90 Kč, bez příplatku za mezinárodní spoj (je to cena
  konkrétních spojů, ne „od“); model podle vzdálenosti tu dával jen ~240 Kč.
- **Letiště za humny** (do 50 km a blíž než jeho město) → regionální bus / vlak rovnou na letiště (Kladno → Ruzyně,
  Bratislava → Vídeň-Schwechat).
- Země výchozího místa bez kódu země (📍 poloha, město z vyhledávání) podle nejbližšího města v datech, ne podle
  nejbližšího letiště – z Ústí nad Labem nebo Děčína (nejblíž Drážďany) se do Prahy nepočítá příplatek přes hranici
  ani česká dálniční známka.
- **Jízdné ×** násobí celý odhad (0,5 = sleva 50 % pro žáky, studenty a seniory, 0 = nepočítat).

Z Prahy na osobu tam: PRG ~50 Kč, PED ~200 Kč, KLV ~220 Kč, JCL ~230 Kč, DRS ~430 Kč, VIE ~440 Kč, MUC ~480 Kč,
BER ~500 Kč; z Brna: BRQ ~30 Kč, BTS ~270 Kč, VIE ~300 Kč. Čas = jízda podle téhož modelu + cesta na letiště + ~20 min
na nádraží a přestup. Ověřeno proti živým cenám RegioJetu a FlixBusu (6. 10. 2026, odjezdy 20. 10. a 12. 11.): Praha →
Karlovy Vary 139–259 Kč, Pardubice 119–169 Kč, České Budějovice 179–279 Kč, Drážďany busem 319–369 Kč (+ S-Bahn ~85 Kč;
počítá se změřená cena, viz výše), Brno → Bratislava 129–279 Kč.

**🚗 Autem** (za auto, pak děleno počtem cestujících):

- **Palivo tam i zpět** = silniční km (≈ 1,25 × vzdušná čára) × spotřeba / 100 × cena. Pohon zvolíš v *Další možnosti →
  Doprava na letiště → 🚗 autem*: **⛽ nafta** (výchozí, 6 l/100 km), **⛽ benzín** Natural 95 (7 l/100 km) nebo
  **⚡ elektro** (19 kWh/100 km, nabíjení). Spotřebu můžeš změnit (jednotka se přepne l/100 km ↔ kWh/100 km a pamatuje se
  pro každý pohon zvlášť); cena je aktuální (viz [Aktuální ceny paliva a nabíjení](#aktuální-ceny-paliva-a-nabíjení)),
  nebo zadáš **vlastní cenu** v Kč/l či Kč/kWh. Formulář ukáže aktuální cenu (*nafta 50,65 Kč/l · ČSÚ, týden
  28. 9.–4. 10.*) a z ní Kč/km (*≈ 3,04 Kč/km*). Praha → Vídeň-Schwechat: 335 km × 6 l/100 km × 50,65 Kč/l = 1 018 Kč
  jedním směrem (dřívějších 2,6 Kč/km dávalo 871 Kč); elektroautem 335 km × 19 kWh/100 km × 16 Kč/kWh = 1 018 Kč.
- **Parkování u letiště podle délky cesty – online předem**: N nocí = N + 1 započatých dní; cena = **základ + sazba
  za den** nejlevnějšího oficiálního dlouhodobého parkoviště s rezervací online (nebo smluvního s kyvadlovou dopravou,
  když je zjevně levnější – Vídeň, Bratislava) – krátké stání vyjde na den dráž než dlouhé. U 18 letišť ověřeno 10/2026:
  ceny na 1, 3, 7 a 14 dní proložené nejmenšími čtverci (tabulka níže); v Pardubicích se parkuje zdarma. Ostatní
  letiště jsou **odhad** (viz pod tabulkou). Počítá se u každé nabídky podle jejích nocí (optimalizátor), ne za letiště –
  na víkend může vyjít Vídeň, na dva týdny Praha.
- **Dálniční známka / mýtné** jen v cizině (domácí známku máš): Rakousko ~320 Kč (12,80 €), Slovensko ~270 Kč
  (10,80 €), Maďarsko ~430 Kč (6 900 Ft; vše 10 dní), Slovinsko ~400 Kč (16 €, 7 dní), Švýcarsko ~1 050 Kč (rok),
  Chorvatsko a Itálie mýtné za jízdu; Německo a Polsko (A1) bez poplatku. Do Budapešti přes Slovensko, do Lublaně
  a Záhřebu přes Rakousko. Když cesta trvá déle, než známka platí, počítá se druhá.
- Autem se vracíš na letiště, kde auto stojí – návrat na jiné letiště v okolí (open-jaw) se v režimu autem nenabízí
  (zaškrtávátko *návrat i na jiné letiště v okolí* je vypnuté s vysvětlením; přílet a odlet z různých letišť cílového
  města zůstává). Stejně u nejlevnější celé cesty přes víc měst.
- **Jen tam** (parkování neznámé): počítá se, že tě někdo odveze a vrátí se – palivo tam i zpět, známka, bez parkování.
  Cesta přes víc měst s návratem domů: palivo u 1. letu i u návratu, parkování na celou plánovanou cestu (nejlevnější
  kombinace se vrací na letiště, kde auto parkuje); bez návratu domů odvoz.
- **Elektroauto** platí parkování i dálniční známky stejně jako spalovací auto – výjimky a slevy pro elektroauta (kde
  existují) se nepočítají.

**Parkování na ověřených letištích** – ceny online předem zjištěné 6. 10. 2026 (Vratislav 7. 10.) pro auto přijíždějící
27. 10. (Praha, Vídeň) a 28. 10. 2026 (ostatní), přepočet 24,4 Kč/€, 5,8 Kč/zł, 0,064 Kč/Ft; model = základ + Kč za den:

| Letiště | Parkoviště, zdroj | Online 1 / 3 / 7 / 14 dní | Pro srovnání | Model (Kč) |
|---|---|---|---|---|
| Praha | booking.prg.aero, aeroparking.cz | 780 / 850 / 1 450 / 2 280 Kč | před T3 bez rezervace 1 000 / 1 700 / 2 500 / 3 900 Kč | 590 + 120 |
| Vídeň | Mazur s kyvadlovou dopravou | 791 / 1 420 / 2 096 / 2 828 Kč | Parkplatz C online 827 / 2 196 / 3 057 / 4 071 Kč | 850 + 150 |
| Brno | ceník brno-airport.cz od 1. 1. 2025 (online voucher stejně) | 300 / 650 / 1 300 / 2 350 Kč | – | 170 + 160 |
| Ostrava | P3–P6, airport-ostrava.cz (rezervace parkum.app stejně) | 130 Kč za každý den | P1 před terminálem 360 Kč/den | 0 + 130 |
| Pardubice | P1 + P2, airport-pardubice.cz | zdarma, bez rezervace | – | zdarma |
| Karlovy Vary | P4 / P5 online, airport-k-vary.cz | 500 Kč za započatý týden (8 dní) | P4 na místě 200 / 400 / 700 / 1 300 Kč; P7 zdarma, místo nezaručené | 280 + 50 \* |
| Bratislava | Parking Airport Bratislava, parkingairport.sk (kyvadlová doprava zdarma, ceník od 1. 10. 2026) | 35 / 41 / 50 / 90 € | letiště P2 online 36 / 55 / 95 / 170 € | 670 + 100 |
| Linec | C1 Charter, linz-airport.com (ceník od 1. 1. 2026, rezervace nejde) | 16,70 / 40 / 63 / 86 € | – | 740 + 100 \* |
| Salcburk | P3 / P7, salzburg-airport.com (sezóna 24. 10.–1. 11.; online obchod nedostupný) | 27 / 59 / 65 / 90 € | mimo sezónu 25 / 57 / 61 / 82 € | 1 170 + 70 \* |
| Mnichov | Economy, parken.munich-airport.de | 33,99 / 45,99 / 63,99 / 87,99 € | na místě 34 / 66 / 107 / 160 € | 790 + 100 |
| Norimberk | P31 / P4 Standard, parking.airport-nuernberg.de (hlavní sezóna do 8. 11.) | 38 / 91 / 131 / 192 € | 18. 11. online 30 / 65 / 87 / 129 €; P3 na místě 57 / 112 / 163 / 234 € | 1 580 + 220 \* |
| Berlín | Economy, ber.apcoa.de | 34 / 64 / 80 / 109 € | P107 na místě 24 €/den, 89 €/týden | 1 260 + 100 \* |
| Drážďany | P2 Flex Plus, parken.dresden-airport.de | 27 / 37 / 57 / 92 € | Parkhaus na místě 40 / 80 / 105 / 140 € | 540 + 120 |
| Lipsko | nejlevnější volné (P6, P2, Parkhaus), parken.leipzig-halle-airport.de | 30 / 50 / 90 / 115 € | P2 na místě 60 / 75 / 95 / 130 € | 750 + 160 |
| Katovice | P4 / P5 (online −5 %), katowice-airport.com | 37 / 66 / 132 / 189 zł | na místě 39 / 69 / 139 / 199 zł | 190 + 70 |
| Krakov | KRK Parking 350 m od terminálu, krakowairportparking.pl (oficiální parkoviště) | 80 / 120 / 200 / 280 zł | P2 / P3 na místě 160 / 200 / 280 / 420 zł | 430 + 90 |
| Vratislav | Parking D dlouhodobý, rezerwacja.airport.wroclaw.pl (rezervace aspoň 4 dny i 1–3 dny předem stejně) | 79 / 139 / 199 / 269 zł | bez rezervace 99 / 189 / 319 / 389 zł; Parking A/B/C/D online 89 / 169 / 299 / 519 zł | 630 + 70 \* |
| Budapešť | Relax Parking (bus k terminálu), parkolo.bud.hu | 5 831 / 9 150 / 13 200 / 16 725 Ft | na místě 7 800 / 12 400 / 20 400 / 32 400 Ft | 400 + 50 |

Přímka přes 1–14 dní sedí do ±15 % (jeden den do ±30 %). \* Ceník po týdnech (nebo silně degresivní), kde jedna přímka
sedí špatně: proloženo jen 3–14 dní, typickou cestu (Linec, Salcburk, Norimberk, Berlín do ±7 %; Vratislav – první den
79 zł, 7–9 dní stejně 199 zł – do ±5 %, celý online ceník 3–16 dní do ±11 %; v Karlových Varech cena po 8 dnech skočí
z 500 na 1 000 Kč a přímka je místy až o třetinu vedle) – jeden den pak vyjde až 2× dráž (Vratislav 700 Kč místo 458 Kč).
Norimberk je 28. 10. ještě v hlavní sezóně, v listopadu je o třetinu levnější. **Odhad** zůstává u ostatních letišť – z
dřívější denní sazby p (týden ≈ 8 × p): velká (p ≥ 250 Kč) základ ≈ 2,9 × p + ≈ 0,55 × p za den (Frankfurt 1 450 + 280,
Štýrský Hradec, Innsbruck, Lublaň 730 + 140), menší a regionální nižší základ ≈ 1,5 × p + ≈ 0,8 × p za den (Poznaň,
Košice 230 + 120, Budějovice 120 + 60…); letiště mimo tabulku podle velikosti.

**Kde to uvidíš:** u letišť pod polem Odkud (*~220 Kč/os. tam*, autem *~750 Kč/os. vč. parkování na 8 dní* pro typickou
délku cesty z formuláře; po najetí myší rozpis – autem *palivo 335 km × 6 l/100 km × 50,65 Kč/l = 1 018 Kč, tam i zpět
~2 036 Kč + parkování online předem ~850 Kč + 150 Kč/den × 8 dní …* a odkud je cena), u ceny nabídky (*+ doprava na
letiště a zpět 450 Kč/os.*, autem *+ autem na letiště a zpět …* s rozpisem paliva a parkování), v pruhu *📅 Nejbližší
dny* (autem se řádky Tam a Zpět sečtou na cenu celé cesty: parkování na celou cestu je u Tam – den odletu dřív = den
parkování navíc –, u Zpět jen o kolik se změní proti zadanému návratu; den, kdy by auto stálo u jiného letiště, má
v ceně i rozdíl letu k autu a zpět; např. Praha → Londýn 28. 10.–2. 11. s cenami ze 7. 10. 2026: Tam 3 145 + Zpět
818 = 3 963 Kč/os., dřív Zpět 1 473 s parkováním podruhé), v patičce
výsledků a v průvodci cestou (*Autem na letiště a zpět (nafta, parkování, odhad)*, *Elektroautem na letiště PRG …*).
*Je to dobrá cena?* dál srovnává jen cenu letenek. Uložená hledání
a hlídané ceny z doby, kdy se doprava zadávala v Kč/km (1,1 Kč/km), se převedou na výchozí odhad veřejnou dopravou;
dřívější Kč/km za auto: výchozích 2,6 → nafta za aktuální cenu, jiná hodnota → vlastní cena nafty se stejnými Kč/km
(3,5 Kč/km = 58,33 Kč/l při 6 l/100 km).

Jízdné a parkování jsou orientační (ceníky dopravců 2025/26, ~25 Kč/€, ~5,8 Kč/zł, ~0,065 Kč/Ft; parkování na
18 letištích ověřené 10/2026, jinde odhad) – skutečná cena záleží na spoji, slevách, termínu, sezóně a obsazenosti
parkoviště.

### Aktuální ceny paliva a nabíjení

Ceny nafty a benzínu bere ATLAS z otevřených dat (`server/lib/fuel.js`, `GET /api/fuel`):

- **Česko:** ČSÚ – *Průměrné spotřebitelské ceny pohonných hmot – týdenní* (DataStat API, sada
  [CENPHMT](https://data.csu.gov.cz/datastat/info/SADA/CENPHMT), otevřená data CC0): nafta a Natural 95 v Kč/l za poslední
  úplný týden, nový týden vychází v pátek ráno. Např. 40. týden 2026 (28. 9.–4. 10.): nafta 50,65 Kč/l, Natural 95
  45,87 Kč/l.
- **Sousední země** (Německo, Rakousko, Slovensko, Polsko, Maďarsko) a záloha pro Česko: Evropská komise –
  [Weekly Oil Bulletin](https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en), ceny s daněmi (EUR za 1000 l
  k pondělí), na Kč aktuálním kurzem. Platí cena v zemi, odkud jedeš (z Bratislavy slovenská nafta, z Vídně rakouská;
  jiná země → česká cena). Českou cenu z bulletinu ATLAS vezme, jen když ČSÚ neodpoví nebo je o víc než týden starší.
- **Obnovení:** každý zdroj nejvýš jednou za 24 hodin (po chybě znovu za 2 h, timeout 8 s). Hledání na síť nikdy
  nečeká – počítá s posledními staženými cenami a nové stáhne na pozadí. Když zdroje nejsou k dispozici, platí
  **vestavěné ceny s datem** (ČSÚ za 40. týden 2026, bulletin k 28. 9. 2026 při kurzu ECB 24,397 Kč/€) s popiskem
  *orientačně, k 28. 9. 2026*. DEMO (`ATLAS_MOCK=1`) a `FUEL_LIVE=0` = pevné ceny bez sítě.
- **⚡ Elektroauto:** na cestě po dálnici se počítá rychlonabíjení (DC), odhad **16 Kč/kWh** (běžně 13–22 Kč/kWh), popisek
  *nabíjení DC ~16 Kč/kWh (ceníky ČEZ, PRE, E.ON, IONITY, Tesla – stav 6. 10. 2026)*. Ceny nabíjení bez předplatného
  (ad hoc) podle ceníků provozovatelů k **6. 10. 2026**:

  | Provozovatel | Kč/kWh |
  |---|---|
  | ČEZ | 16,90 (AC) / 22,90 (DC) |
  | PRE | 13 (AC) / 15 (DC) |
  | E.ON | 10,50–20 |
  | IONITY | 21 (DC) |
  | Shell Recharge¹ | 15 |
  | MOL Plugee¹ | 14,50 (AC) / 15,50 (DC) |
  | Tesla Supercharger – auta jiných značek¹ | 8–14 (DC) |

  ¹ ze sekundárních zdrojů. Skutečná cena se liší podle provozovatele, výkonu nabíječky a členství či předplatného (s ním
  bývá nabíjení levnější, doma ještě levnější) – kdo nabíjí jinak, zadá *vlastní cenu*. Tabulka je v
  `server/lib/fuel.js` (`EV_DC`) a v `GET /api/fuel` (`ev`).

## Z letiště do města

„Levná“ letenka na vzdálené letiště levná být nemusí: z Paříže-Beauvais jede do Paříže autobus za 17,90 € a 1 h 15,
z Girony do Barcelony za 22 €, z Torpu do Osla za 279 NOK a přes hodinu a půl – a to každým směrem. ATLAS proto
u každé nabídky ukáže, kolik stojí a jak dlouho trvá cesta z letiště příletu do města (a z města na letiště odletu),
a v *Další možnosti → Z letiště do města* ji se zaškrtnutým **vč. cesty z letiště do města** (výchozí) přičte k ceně –
tam i zpět, na osobu.

- **Štítek u nabídky:** *🚌 z letiště BVA do Paříže 17,90 € (~440 Kč) · 1 h 15*; návrat z jiného letiště v cíli
  (open-jaw) má vlastní štítek *🚆 zpět na letiště CDG 14 € (~340 Kč) · 35 min* (nahrazuje dřívější *✈ zpět z CDG*).
  **Žlutě**, když cesta stojí přes **350 Kč/os.** jedním směrem nebo trvá **přes hodinu** – Beauvais, Charleroi,
  Hahn, Weeze, Girona, Reus, Skavsta, Västerås, Torp, Southend, Memmingen, Keflavík, Malpensa (vlak 15 €) a istanbulská
  letiště (autobus ~1,5 h). Mez je 350 Kč, ne 300 Kč, aby se nezvýrazňovala Paříž-CDG a Orly ani Řím-Fiumicino
  (vlak / metro za 14 € ≈ 340 Kč, do 35 min) – tam je to cena běžné cesty do města, ne past. Po najetí myší rozpis:
  čím a kam, jízdné v místní měně, čas, poznámka (online předem / na místě dráž, rychlejší dražší spoj), zdroj
  a datum ověření; u odhadu z čeho vychází. U cesty přes víc měst má štítky každý let (z města na letiště odletu
  a z letiště příletu do města, doma ne). Štítek nahrazuje dřívější *📏 X km od centra*.
- **V ceně:** u ceny nabídky *+ z letiště do města a zpět ~780 Kč/os.*; podle ceny i s cestou do města se řadí,
  filtruje (*Max. cena*), počítá kalendář cen, pruh *📅 Nejbližší dny*, složení dvou samostatných letenek u přesných
  dat i nejlevnější celá cesta přes víc měst (cesta mezi letištěm a městem u každého místa na cestě). Patička výsledků
  řekne, jestli je cesta do města v ceně. Vypnutá volba cestu do města jen nepřičítá – štítky zůstanou.
- **Průvodce cestou:** v kroku ✈️ Let a v časové ose řádky *Z letiště BVA → Paříž · autobus Aérobus do Paris Porte
  Maillot · ~1 h 15 min · 17,90 € (~440 Kč)/os.* a *Paříž → letiště ORY · metro 14 · ~25 min · 14 € (~340 Kč)/os.*,
  ve Shrnutí položka **Doprava z letiště do města a zpět (odhad)** – jen když byla v ceně hledání. Úsek, který nahradí
  auto půjčené na letišti příletu (nebo vrácené na letišti odletu), odpadá. U trasy přes víc míst je jízdné u přejezdu
  z letiště na první místo a z posledního místa na letiště, leží-li to místo ve městě letiště (do 25 km).
- **Hlídané ceny** uložené před touto volbou se dál počítají bez cesty do města, ať jde nová cena porovnat s dřívější;
  dotaz na API bez pole `arrival` taky (viz [API](#api)).

**Odkud jsou čísla** (`data/arrival.json`, `server/lib/arrival.js`) – na osobu a jeden směr, jízdenka pro dospělého,
nejlevnější běžná cesta letištním busem, vlakem nebo metrem do centra (taxi ani soukromé transfery ne); „od“ = cena
online předem:

1. **Ověřená tabulka 74 letišť** z oficiálních stránek letiště, dopravce nebo dopravního svazu, **ověřeno 7. 10. 2026**.
   U 6 letišť (²) jen sekundární zdroj – oficiální stránka cenu neuvádí nebo se nedala načíst; u 9 dalších (Alicante,
   Palma, Soluň, Larnaka, Pafos, Malta, Sofie, Tel Aviv, Dubaj) je jízdné oficiální a jen čas jízdy ze sekundárních
   zdrojů (uvedeno v poznámce). Přepočet na Kč kurzem ČNB k 6. 10. 2026 (MAD, EGP, AED kurzy ostatních měn k 30. 9.
   2026), zaokrouhleno na 10 Kč.
2. **Letiště z tabulky [cesty na letiště](#doprava-na-letiště)** (~35 letišť do ~450 km od Česka, `access.js`) – stejný
   spoj obráceně (Vídeň, Mnichov, Berlín, Drážďany…), s popiskem odhad. Letiště v obou tabulkách mají stejné jízdné
   a čas: podle ověření 10/2026 se v `access.js` opravily Memmingen (450 → 370 Kč, online od 15 €), Frankfurt (155 → 170
   Kč), Krakov (80 → 110 Kč), Budapešť (140 → 170 Kč) a Záhřeb (200 → 220 Kč); test hlídá shodu.
3. **Odhad** pro ostatní letiště: vzdálenost do centra (letiště metropole s víc letišti od jejího středu, jinak typicky
   15 km u velkého, 10 km u středního a 6 km u malého letiště) → regionální jízdné z cesty na letiště (30 Kč + 1,5 Kč/km;
   15 min + 1,1 min/km + 10 min čekání) × cenová hladina země 1–5 z přehledu zemí (×0,5 / ×1 / ×2 / ×2,8 / ×4), aspoň
   jízdenka MHD země. Na ověřené tabulce dává odhad v geometrickém průměru ~0,9 skutečné ceny, u tří čtvrtin letišť do
   dvojnásobku (test). Ze zadaných letišť zůstaly odhadem **Antalya, Hurghada a Šarm aš-Šajch** – oficiální jízdné
   do města se ověřit nepodařilo: ~60 Kč, ~40 min, s popiskem *odhad*.

| Letiště | Čím do centra | Jízdné | Kč | Čas | Zdroj |
|---|---|---|---|---|---|
| BVA Paříž | autobus Aérobus do Paris Porte Maillot | 17,90 € | 440 ⚠ | 1 h 15 | [aeroportparisbeauvais.com](https://www.aeroportparisbeauvais.com/acces-et-parking/navette-aerobus-paris-aeroport) |
| CDG Paříž | vlak RER B do centra (Gare du Nord, Châtelet) | 14 € | 340 | 35 min | [iledefrance-mobilites.fr](https://www.iledefrance-mobilites.fr/titres-et-tarifs/detail/ticket-paris-region-aeroports) |
| ORY Paříž | metro 14 do Châtelet | 14 € | 340 | 25 min | [iledefrance-mobilites.fr](https://www.iledefrance-mobilites.fr/titres-et-tarifs/detail/ticket-paris-region-aeroports) |
| CRL Brusel | autobus flibco do Bruxelles-Midi | od 14,99 € | 370 ⚠ | 55 min | [flibco.com](https://www.flibco.com/en/shuttle/bus-brussels-charleroi-airport) |
| BRU Brusel | autobus STIB Airport Line 12 do evropské čtvrti | 7,90 € | 190 | 30 min | [stib-mivb.be](https://www.stib-mivb.be/travel/other-mobility-solutions/airport-line) |
| STN Londýn | vlak Stansted Express do Liverpool Street | od 9,90 £ | 280 | 48 min | [stanstedexpress.com](https://www.stanstedexpress.com/tickets-fares/ticket-types) |
| LTN Londýn | Luton DART + vlak Luton Airport Express do St Pancras | od 10 £ | 290 | 32 min | [london-luton.co.uk](https://www.london-luton.co.uk/to-and-from-lla/trains/luton-airport-express) |
| LGW Londýn | vlak Southern / Thameslink do Victoria nebo London Bridge | 10,70 £ | 310 | 35 min | [lasttrip.uk](https://lasttrip.uk/blog/cheapest-way-london-to-gatwick.html) ² |
| LHR Londýn | metro Piccadilly line do centra | od 5,50 £ | 160 | 50 min | [heathrow.com](https://www.heathrow.com/transport-and-directions/getting-to-central-london) |
| SEN Londýn | vlak Greater Anglia do Liverpool Street | od 13,40 £ | 390 ⚠ | 52 min | [londonsouthendairport.com](https://londonsouthendairport.com/getting-to-and-from/trains/) |
| MAN Manchester | vlak do Manchester Piccadilly | od 2,90 £ | 80 | 20 min | [tpexpress.co.uk](https://www.tpexpress.co.uk/travelling-with-us/routes/trains-from-manchester-airport-to-manchester-piccadilly) |
| EDI Edinburgh | autobus Airlink 100 na Waverley Bridge | 6 £ | 170 | 30 min | [lothianbuses.com](https://www.lothianbuses.com/our-services/airport-buses/) |
| DUB Dublin | městský autobus Dublin Bus 16 do centra | 2,60 € | 60 | 40 min | [dublinbus.ie](https://www.dublinbus.ie/journey-information/dublin-airport-hub) |
| BGY Milán | autobus Terravision do Milano Centrale | od 5 € | 120 | 50 min | [terravision.eu](https://www.terravision.eu/airport_transfer/bus-bergamo-airport-milan/) |
| MXP Milán | vlak Malpensa Express do Milano Cadorna | 15 € | 370 ⚠ | 37 min | [malpensaexpress.it](https://www.malpensaexpress.it/en/travel-documents/tickets/) |
| LIN Milán | metro M4 do San Babila | 2,20 € | 50 | 12 min | [atm.it](https://www.atm.it/en/ViaggiaConNoi/InfoTraffico/Pages/M4passengerserviceinformation2.aspx) |
| TSF Benátky | autobus Barzi Service do Mestre a na Piazzale Roma | 10 € | 240 | 40 min | [barziservice.com](https://barziservice.com/en/travel-with-us/treviso-airport-line/) |
| VCE Benátky | autobus ACTV 5 Aerobus na Piazzale Roma | 10 € | 240 | 20 min | [veneziaunica.it](https://www.veneziaunica.it/en/buy-tickets/airport-transfers-marco-polo-and-canova) |
| CIA Řím | autobus SIT Bus Shuttle do Roma Termini | 6 € | 150 | 40 min | [sitbusshuttle.com](https://www.sitbusshuttle.com/en/transfer-ciampino-airport/) |
| FCO Řím | vlak Leonardo Express do Roma Termini | 14 € | 340 | 32 min | [trenitalia.com](https://www.trenitalia.com/en/connections/leonardo-express.html) |
| NAP Neapol | autobus Alibus na Napoli Centrale a do přístavu | 5 € | 120 | 15 min | [aeroportodinapoli.it](https://www.aeroportodinapoli.it/en/by-bus) |
| BLQ Boloňa | Marconi Express na Bologna Centrale | 8,20 € | 200 | 7 min | [marconiexpress.it](https://www.marconiexpress.it/en/tickets/fares/) |
| PSA Pisa | PisaMover na Pisa Centrale | 6,50 € | 160 | 5 min | [trenitalia.com](https://www.trenitalia.com/it/regionale/collegamenti-regionale/collegamenti-con-l-aeroporto-galileo-galilei-di-pisa.html) |
| FLR Florencie | tramvaj T2 do centra (Unità – Santa Maria Novella) | 2 € | 50 | 20 min | [files.at-bus.it](https://files.at-bus.it/s3fs-public/documents/Nuove%20tariffe%20AT%202026.pdf) |
| NYO Stockholm | autobus Flygbussarna do Stockholm C (Cityterminalen) | od 229 SEK | 500 ⚠ | 1 h 20 | [flygbussarna.se](https://www.flygbussarna.se/en/skavsta) |
| ARN Stockholm | autobus Flygbussarna do Stockholm C (Cityterminalen) | od 129 SEK | 280 | 40 min | [flygbussarna.se](https://www.flygbussarna.se/en/arlanda) |
| VST Stockholm | autobus Flygbussarna do Stockholm C (Cityterminalen) | od 229 SEK | 500 ⚠ | 1 h 20 | [flygbussarna.se](https://www.flygbussarna.se/en/vasteras) |
| GOT Göteborg | autobus Flygbussarna do Göteborg C | 129 SEK | 280 | 20 min | [flygbussarna.se](https://www.flygbussarna.se/en/landvetter) |
| TRF Oslo | autobus Torp-ekspressen do centra Osla | od 279 NOK | 630 ⚠ | 1 h 35 | [en.torpekspressen.no](https://en.torpekspressen.no/tickets-and-prices/) |
| OSL Oslo | regionální vlak Vy na Oslo S | 129 NOK | 290 | 23 min | [visitoslo.com](https://www.visitoslo.com/no/transport/transport-flyplass/oslo-gardermoen) ² |
| HHN Frankfurt | autobus flibco do Frankfurt Hbf | od 18,99 € | 460 ⚠ | 2 h 10 | [flibco.com](https://www.flibco.com/en/shuttle/bus-frankfurt-hahn-airport) |
| FRA Frankfurt | S-Bahn S8 / S9 do centra (Hauptbahnhof ~11 min) | 6,90 € | 170 | 15 min | [vgf-ffm.de](https://www.vgf-ffm.de/fileadmin/VGF/Tickets__Tarife__Plaene/Fahrpreise/Documents/Preisliste_2026.pdf) |
| NRN Düsseldorf | autobus Airport Weeze Shuttle do Düsseldorf Hbf | 24 € | 590 ⚠ | 1 h 15 | [airport-weeze.com](https://airport-weeze.com/en/neuer-busdienst-vom-hauptbahnhof-duesseldorf-zum-airport-weeze/) |
| DUS Düsseldorf | S-Bahn / tramvaj U80 na Düsseldorf Hbf | 3,80 € | 90 | 18 min | [vrr.de](https://www.vrr.de/fileadmin/user_upload/pdf/service/downloads/Weitere_Broschueren_und_Tarifinformationen/VRR_Preise_2026.pdf) |
| CGN Kolín nad Rýnem | S-Bahn S19 na Köln Hbf | 4 € | 100 | 15 min | [vrs.de](https://www.vrs.de/fileadmin/01_Tickets/Rheinlandtarif/VRS_Preistabelle_06-2026_final.pdf) |
| FMM Mnichov | autobus Allgäu Airport Express do München Hbf | od 15 € | 370 ⚠ | 1 h 20 | [allgaeu-airport.de](https://www.allgaeu-airport.de/mit-dem-bus-zum-flieger/) |
| GRO Barcelona | autobus Sagalés Airport Line na Barcelona Nord | 22 € | 540 ⚠ | 1 h 15 | [sagalesairportline.com](https://www.sagalesairportline.com/en) |
| REU Barcelona | autobus Monbus na Barcelona Sants | 18,50 € | 450 ⚠ | 1 h 40 | [catalunya.monbus.es](https://catalunya.monbus.es/wp-content/uploads/2026/04/H_AeropuertoReus_2026-04.pdf) |
| BCN Barcelona | autobus Aerobús na Plaça de Catalunya | 7,45 € | 180 | 35 min | [aerobusbarcelona.es](https://aerobusbarcelona.es/en/rates/) |
| MAD Madrid | autobus Exprés Aeropuerto na Atochu | 5 € | 120 | 35 min | [emtmadrid.es](https://www.emtmadrid.es/Aeropuerto?lang=en-GB) |
| AGP Málaga | autobus A Express do centra | 4 € | 100 | 15 min | [aena.es](https://www.aena.es/en/malaga-costa-del-sol/getting-there/bus.html) |
| ALC Alicante | autobus C-6 do centra a na nádraží | 4,60 € | 110 | 25 min | [alicante.vectalia.es](https://alicante.vectalia.es/notificacion/modificacion-tarifas/) |
| PMI Palma | autobus EMT A1 na Plaça d'Espanya | 5 € | 120 | 25 min | [aena.es](https://www.aena.es/en/palma-de-mallorca/getting-there/bus.html) |
| VLC Valencie | metro 3 / 5 do centra (Xàtiva, Colón) | 4,80 € | 120 | 20 min | [metrovalencia.es](https://www.metrovalencia.es/en/fares/) |
| SVQ Sevilla | autobus EA (Tussam) do centra | 6 € | 150 | 35 min | [tussam.es](https://www.tussam.es/en/node/1397) |
| OPO Porto | metro E na Trindade | 2,25 € | 50 | 27 min | [en.metrodoporto.pt](https://en.metrodoporto.pt/pages/397) |
| LIS Lisabon | metro (červená linka) do centra | 1,90 € | 50 | 20 min | [metrolisboa.pt](https://www.metrolisboa.pt/en/2025/12/19/new-fares-2026-2/) |
| FAO Faro | autobus Próximo 16 na autobusové nádraží | 2,50 € | 60 | 15 min | [citiesinsider.com](https://citiesinsider.com/country/portugal/faro/guides/faro-transport/de) ² |
| ATH Atény | autobus X95 na Syntagma | 5,50 € | 130 | 1 h | [oasa.gr](https://www.oasa.gr/en/visit-athens/airport-express-bus-lines/) |
| SKG Soluň | autobus 01X do centra a na nádraží | 1,80 € | 40 | 45 min | [skg-airport.gr](https://www.skg-airport.gr/en/category-detailed/ctg_id-37/nd_id-425) |
| LCA Larnaka | městský autobus do centra (Finikoudes) | 1,50 € | 40 | 20 min | [cyprusbybus.com](https://www.cyprusbybus.com/busfares.aspx) |
| PFO Pafos | městský autobus 612 do Kato Pafos (přístav) | 1,50 € | 40 | 35 min | [cyprusbybus.com](https://www.cyprusbybus.com/busfares.aspx) |
| MLA Valletta | autobus Airport Direct TD4 do Valletty | 3 € | 70 | 25 min | [publictransport.com.mt](https://www.publictransport.com.mt/easy-and-convenient-airport-transfers-with-airport-direct/) |
| DBV Dubrovník | autobus Platanus ke starému městu a do Gruže | 10 € | 240 | 35 min | [platanus.hr](https://platanus.hr/dubrovnik-airport-shuttle/) |
| SPU Split | autobus Platanus na autobusové nádraží | 10 € | 240 | 30 min | [platanus.hr](https://platanus.hr/split-airport-shuttle-bus/) |
| ZAG Záhřeb | autobus Pleso prijevoz na autobusové nádraží | 9 € | 220 | 35 min | [plesoprijevoz.hr](https://www.plesoprijevoz.hr/en) |
| BUD Budapešť | autobus 100E na Deák Ferenc tér | 2 500 Ft | 170 | 40 min | [bkk.hu](https://bkk.hu/en/tickets-and-passes/prices/airport-shuttle-bus-single-ticket/) |
| OTP Bukurešť | vlak CFR na Gara de Nord | 6,50 lei | 30 | 25 min | [cfrcalatori.ro](https://www.cfrcalatori.ro/en/bucuresti-nord-railway-station-henri-coanda-airport/) |
| SOF Sofie | metro M4 do centra (Serdika) | 0,80 € | 20 | 25 min | [metropolitan.bg](https://www.metropolitan.bg/en/information-for-citizens/trip-cards-sofia-metro) |
| KRK Krakov | vlak Koleje Małopolskie na Kraków Główny | 20 zł | 110 | 20 min | [krakowairport.pl](https://krakowairport.pl/en/train-en) |
| WAW Varšava | vlak SKM / KM nebo autobus 175 do centra | 4,40 zł | 20 | 30 min | [wtp.waw.pl](https://www.wtp.waw.pl/en/public-transport-step-by-step/airports-transport/) |
| WMI Varšava | autobus KM na nádraží Modlin + vlak KM do centra | 20 zł | 110 | 1 h | [mazowieckie.com.pl](https://www.mazowieckie.com.pl/en/travelers-area/airport-ticket-special-offer) |
| GDN Gdaňsk | autobus 210 na Gdańsk Główny | 4,80 zł | 30 | 40 min | [airport.gdansk.pl](https://www.airport.gdansk.pl/en/before-travel/getting-to-the-airport/bus) |
| AMS Amsterdam | vlak NS na Amsterdam Centraal | 5,60 € | 140 | 17 min | [amsterdamtips.com](https://www.amsterdamtips.com/?p=2759) ² |
| EIN Eindhoven | autobus Hermes 400 na Eindhoven Centraal | 5,15 € | 130 | 20 min | [eindhovenairport.nl](https://www.eindhovenairport.nl/en/public-transport) |
| RTM Rotterdam | autobus 33 + metro E do centra | 5,50 € | 130 | 20 min | [ret.nl](https://www.ret.nl/en/home/travel-products/tourist/rotterdam-the-hague-airport.html) |
| KEF Reykjavík | autobus Flybus na terminál BSÍ | od 3 999 ISK | 710 ⚠ | 45 min | [flybus.is](https://flybus.is/keflavik-reykjavik-airport-transfer/) |
| IST Istanbul | autobus Havaist na Taksim | 426 TRY | 190 ⚠ | 1 h 30 | [hava.ist](https://www.hava.ist/) |
| SAW Istanbul | autobus Havabüs na Taksim | 485 TRY | 210 ⚠ | 1 h 30 | [havabus.com](https://www.havabus.com/yolcuservisi/taksim-sabihagokcenhavalimani.aspx) |
| TLV Tel Aviv | vlak Israel Railways do Tel Avivu (HaHagana, Savidor) | 13,50 ILS | 100 | 20 min | [visit.tel-aviv.gov.il](https://visit.tel-aviv.gov.il/move/airport) |
| RAK Marrákeš | autobus 19 (ALSA) na Jemaa el-Fna | 30 MAD | 70 | 25 min | [pointswithacrew.com](https://www.pointswithacrew.com/how-to-use-marrakech-airport-bus-19-to-marrakech-city-center-a-step-by-step-guide/) ² |
| CMN Casablanca | vlak ONCF do Casa Voyageurs | 50 MAD | 110 | 30 min | [onda.ma](https://www.onda.ma/fr/Nos-A%C3%A9roports/A%C3%A9roport-Casablanca-Mohammed-V/Acc%C3%A8s-Facilitations/Par-train) |
| DXB Dubaj | metro Red Line do centra (Burj Khalifa / Dubai Mall) | 7,50 AED | 40 | 27 min | [rta.ae](https://www.rta.ae/wps/portal/rta/ae/public-transport/Nol-Fares) |
| BKK Bangkok | vlak Airport Rail Link na Phaya Thai | 45 THB | 30 | 26 min | [railtravelstation.com](https://railtravelstation.com/airport-rail-link-city-line-suvarnabhumi-airport-to-bangkok-city-by-train/) ² |

⚠ = zvýrazněno (přes 350 Kč nebo přes 60 min). ² = sekundární zdroj. Čas je typická jízda bez čekání na spoj (u vlaku
a metra podle jízdního řádu, u autobusu podle dopravce).

## Vlak nebo bus místo letadla

Do blízkých měst (Vídeň, Berlín, Mnichov, Budapešť, Krakov…) bývá vlak nebo autobus stejně rychlý jako letadlo
i s cestou na letiště a odbavením – a mnohem levnější. ATLAS to ukáže sám, jen v Evropě a jen tam, kde to dává smysl:

- **Výsledky letů** – u cílů v dosahu čip *🚆 i vlakem/busem ~4 h 20 · od ~299 Kč* (odhad; u zpátečního hledání cena
  tam i zpět – *· tam i zpět od ~598 Kč* –, ať jde porovnat s cenou letenek vedle; u cesty delší než ~8 h jen,
  když se vyplatí). U hledání ke konkrétnímu
  blízkému cíli nahoře srovnání **letadlo × vlak/bus** (cena na osobu, čas od dveří ke dveřím; letadlo = nejlevnější
  nabídka do tohoto cíle, která projde filtry výpisu, i s časem **svého** letu tam vč. přestupů – a když je jiná cesta
  aspoň o hodinu rychlejší, druhý řádek *⚡ nejrychlejší ~4 h 35 od 11 994 Kč*; cena a čas jsou vždy z téže cesty a
  u zpáteční platí čas pro oba směry (přímý let tam s návratem s přestupem na celý den „nejrychlejší“ není; u přesných
  dat ATLAS nejrychlejší dvojici samostatných letenek složí sám, i když ji server mezi nejlevnějšími kombinacemi neposlal).
  Když neprojde žádná, napíše „skryto filtry“) a tlačítko *Ukázat spoje*:
  skutečné spoje RegioJetu na zvolený den (čas, délka, přestupy, vlak/bus, cena od–do, volná místa), na vyžádání i zpět,
  a odkazy na RegioJet, FlixBus, IDOS a Google Mapy. Když se let nenajde nebo je jich málo, nabídne vlak/bus i chytrá
  nápověda.
- **Průvodce cestou** – v kroku ✈️ Let u blízkého cíle volba *🚆 Pojedu vlakem / busem*: dny tam a zpět, výběr
  konkrétního spoje RegioJetu (nebo ponechat odhad). Vlak/bus pak nahradí let v termínech pobytu, v trase přes víc míst,
  v ceně ve Shrnutí, v plánovači, ve sdíleném odkazu i v kalendáři (.ics) – a jedním kliknutím jde vrátit zpět k letu.

**Kde to dává smysl:** obě místa na pevnině Evropy (ne Velká Británie, Irsko, Island, Malta, Kypr ani ostrovy jako
Mallorca, Kanáry, Korsika, Sardinie, Sicílie, Kréta) a nejvýš ~1 100 km vzdušnou čarou (do Švédska a Norska po souši přes Øresundský most – Stockholm ani Oslo už ne). **Zvýrazní se**, když platí
jednoduché pravidlo: cesta po zemi (+30 min na nádraží) je nejvýš o 1,5 h delší než letadlo od dveří ke dveřím
(cesta na letiště + 2 h před odletem + nejrychlejší nalezený let – u zpáteční cesty pomalejší z obou směrů – + 45 min po přistání + cesta do města), **nebo** trvá do 6,5 h, **nebo** je
aspoň o polovinu levnější než nejlevnější let a do 10 h. Důvod se u srovnání vždy napíše česky a jmenuje let, se kterým
srovnává („rychleji než letadlem (nejrychlejší let ~4 h 35 od dveří ke dveřím, od 11 994 Kč)“). Ve výsledcích se
počítá z nabídek, které výpis po filtrech ukazuje (stejné pravidlo na serveru i v prohlížeči).

**Co je odhad a co živá data:**

| | Zdroj | Jak |
|---|---|---|
| **Odhad** (čip, srovnání, „od ~X Kč“) | Praha ↔ Vídeň, Berlín, Mnichov, Budapešť, Krakov, Benátky, Paříž, Amsterdam, Curych: **změřeno** 5. 10. 2026 na den 13. 10. 2026 (nejrychlejší spoj a nejnižší cena RegioJetu a FlixBusu, průzkum `research/ground.md` ve větvi `pc-research`); jinde **model podle vzdálenosti** kalibrovaný na téže tabulce (do 450 km ~66 km/h, dál ~55 km/h + přestupy; cena ~120 Kč + 0,62 Kč/km, nad 450 km víc – jen po Česku, Slovensku, Polsku, Maďarsku a Ukrajině dál stejně levně, tam jezdí levné vlaky) a ověřený na dalších 24 trasách RegioJetu (většinou ±10–20 %); vede-li přímka přes Alpy nebo Dinárské hory, je čas o čtvrtinu delší (Praha–Klagenfurt ~7 h 20, ne 5 h 50); do Švédska a Norska se počítá cesta po souši přes Øresundský most | bez sítě, počítá se u každého hledání a hledání nezpomalí; vždy označeno „odhad“ |
| **RegioJet – živé ceny** | veřejné rozhraní webu regiojet.cz (`brn-ybus-pubapi.sa.cz`, bez klíče) | **jen ze serveru** (z prohlížeče cizího webu vrací 403) a **jen na vyžádání** – po kliknutí na *Ukázat spoje* nebo při výběru spoje v průvodci; mezipaměť 3 h, jeden dotaz naráz, aspoň 1 s mezi dotazy, nejvýš 60 za hodinu, timeout 8 s, jedno opakování (také s odstupem a v hodinovém stropu); při chybě platí odhad |
| **FlixBus – jen odkaz** | jen UUID měst pro předvyplněný odkaz do e-shopu | podmínky FlixBusu zakazují automatické (komerční) využívání dat bez písemné smlouvy, proto ATLAS jeho ceny ani spoje **nenačítá**; UUID se zjistila jednorázově ve skriptu `scripts/build-ground.mjs` |
| **IDOS, Google Mapy – odkazy** | IDOS (vlaky ČD i zahraniční, autobusy) s datem; Google Mapy veřejnou dopravou bez data | ÖBB, DB, ČD, Trainline ani Omio data bez partnerské smlouvy nedávají – jen odkazy |

Města a jejich ID jsou v `data/ground.json` (262 měst: 170 měst RegioJetu s polohou hlavní zastávky z jeho seznamu,
107 z nich i s UUID FlixBusu, a 92 dalších větších evropských měst z našich dat do ~1 300 km od Česka, která FlixBus zná –
poloha středu města z FlixBusu). Místní názvy („Wien“, „Napoli“) jsou kvůli odkazům do IDOS a Google Map. Sestavení:
`npm run build:ground -- --cache <adresář>` (RegioJet 1 dotaz, FlixBus nejvýš 1 dotaz za sekundu, mezipaměť
v `--cache`, přerušené sestavení pokračuje). V DEMO režimu (`ATLAS_MOCK=1`) jsou spoje RegioJetu vymyšlené a označené.

**Vypínač:** `REGIOJET_LIVE=0` vypne živé spoje RegioJetu (zůstane odhad a odkazy; na Renderu: služba → Environment). Podmínky použití rozhraní RegioJetu nejsou veřejné: **před ostrým provozem doporučuji napsat RegioJetu
a požádat o souhlas** (případně o partnerský přístup); do té doby je dotazů záměrně málo a jen na pokyn uživatele.

## Spuštění

Potřebuješ jen **Node.js 20+** – žádné balíčky se neinstalují.

```bash
npm start            # http://localhost:8080 – skutečné ceny
npm run demo         # vymyšlená ukázková data (offline, pro vyzkoušení UI)
npm test             # testy
```

Aplikace potřebuje server (ne jen otevřít HTML soubor): API aerolinek z prohlížeče nejdou volat kvůli CORS,
server navíc cachuje odpovědi, přepočítává měny a skládá kombinace.

### Nastavení (`.env`, volitelné)

Zkopíruj `.env.example` na `.env`:

| Proměnná | Výchozí | Význam |
|---|---|---|
| `TRAVELPAYOUTS_TOKEN` | – | zapne další aerolinky (zdarma na travelpayouts.com → Developers → API token) |
| `TRAVELPAYOUTS_MARKER` | – | tvůj affiliate marker (ID účtu) – připojí se k odkazům na Aviasales |
| `TRAVELPAYOUTS_TRS` | – | číslo projektu Travelpayouts; s markerem převede odkazy na Aviasales, Booking.com a DiscoverCars na partnerské (`tp.media`) a viditelně je označí jako reklamu |
| `TRAVELPAYOUTS_MARKET` | `cz` | trh Aviasales, z jehož vyhledávání se berou ceny (bez něj API čte ruský trh) |
| `KIWI_ENABLED` | `1` | Kiwi.com: živá cena a porovnání aerolinek k vybranému letu (zdarma, bez klíče); `0` = vypnout |
| `LITEAPI_KEY` | – | hotely s cenou na tvoje data a hodnocením hostů (zdarma klíč na dashboard.liteapi.travel; `sand_…` = testovací data) |
| `LITEAPI_WHITELABEL` | – | doména white-label rezervační stránky LiteAPI – tlačítko „detail“ pak vede tam místo na Booking.com |
| `PARTNER_LOOKUP` | `1` | odkazy na Trip.com, Agodu a Hostelworld s termínem a hosty: server u nich jednou dohledá ID místa (jeden dotaz na místo a partnera, timeout 4 s, mezipaměť 30 dní); `0` = bez dotazů, odkazy jen s názvem místa (Trip.com hledání potvrdíš, Agoda úvodní stránka, Hostelworld stránka města bez dat). V DEMO se neptá nikdy |
| `PORT` | `8080` | port serveru |
| `MAX_ORIGINS` | `8` | kolik nejbližších letišť se v jednom hledání prohledá |
| `WIZZ_MAX_CALLS` | `60` | Wizz Air nemá „kamkoliv“ – kolik dotazů na trasy smí jedno hledání udělat |
| `RYANAIR_ENABLED` / `WIZZ_ENABLED` | `1` | `0` = zdroj vypnout |
| `SEARCH_RATE_LIMIT` | `40` | max. hledání z jedné IP za 10 minut (ochrana při veřejném nasazení, `0` = bez limitu); počítají se do něj i dotazy na živé spoje RegioJetu (jen ty, které opravdu jdou na RegioJet – odpověď z mezipaměti ne) |
| `REGIOJET_LIVE` | `1` | `0` = vypnout živé spoje RegioJetu (vlak/bus místo letadla zůstane jako odhad a odkazy) |
| `REGIOJET_MAX_PER_HOUR` | `60` | nejvýš tolik dotazů na RegioJet za hodinu (pak jen odhad) |
| `REGIOJET_GAP_MS` | `1000` | nejmenší odstup dotazů na RegioJet (ms) |
| `FUEL_LIVE` | `1` | `0` = ceny paliva bez sítě (vestavěné orientační ceny s datem místo ČSÚ a Oil Bulletinu) |
| `FUEL_TIMEOUT_MS` | `8000` | timeout stahování cen paliva z ČSÚ a Oil Bulletinu (ms) |
| `ATLAS_MOCK` | `0` | `1` = demo data (totéž co `npm run demo`) |

### Nasazení na internet (trvalý odkaz)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/tomaspetera/travel-app)

1. Klikni na tlačítko výše a přihlas se přes GitHub (Render může chtít ověřit kartu – blokne 1 $ a hned vrátí).
2. Potvrď **Deploy Blueprint** a počkej 2–5 minut, až služba svítí zeleně **Live**.
3. Nahoře u služby je tvůj odkaz, např. `https://atlas-letenky.onrender.com` – ten si ulož.
4. Otevři `…/api/diag` – ukáže, jestli server na hostingu dosáhne na Ryanair a Wizz Air.

Varianty provozu:

- **Zdarma** – po 15 minutách bez návštěvy aplikace usne a první načtení pak trvá 30–60 s.
  Technicky ji jde držet vzhůru pravidelným „pingováním“ (např. UptimeRobot na `…/healthz` každých 5 min),
  ale zaměstnanci Renderu to označují za zneužití bezplatného tarifu – hrozí pozastavení služby. Nedoporučuji.
- **Starter za 7 $ měsíčně** (služba → Settings → General → Instance Type → Starter) – běží nonstop bez usínání.

#### Automatické nasazení po každé změně

Služba vytvořená z adresy veřejného repozitáře se na Renderu sama nenasazuje. Nasazení proto spouští GitHub Actions
(`.github/workflows/deploy.yml`): u každé změny v `main` proběhnou testy, a když projdou, zavolá se Deploy Hook Renderu.

1. Render → služba → **Settings → Deploy Hook** → zkopíruj adresu (je tajná, nikam ji nevkládej veřejně).
2. GitHub → repozitář → **Settings → Secrets and variables → Actions → New repository secret**,
   název `RENDER_DEPLOY_HOOK`, hodnota = adresa z kroku 1 → **Add secret**.
3. Hotovo – každá nová verze v `main` se nasadí sama (průběh v záložce **Actions**), odkaz zůstává stejný.
   Ručně jde nasazení spustit v Renderu přes **Manual Deploy → Deploy latest commit**.

Funguje i kdekoliv jinde, kde běží Node.js – **Railway** (Hobby 5 $/měs.), **Fly.io**, vlastní VPS. Je přiložen `Dockerfile`:

```bash
docker build -t atlas . && docker run -p 8080:8080 --env-file .env atlas
```

GitHub Pages nestačí (je to jen statický hosting bez serveru).

## Aplikace na ploše a offline

ATLAS jde přidat na plochu telefonu i počítače jako aplikaci (PWA): otevře se přes celou obrazovku bez lišty prohlížeče
a s vlastní ikonou a **uložené cesty a plány uvidíš i bez internetu**.

- **Chrome, Edge, Android**: v postranním panelu (na mobilu v nabídce **Více**) je **📲 Přidat ATLAS na plochu** –
  otevře instalační dialog prohlížeče. Na počítači jde instalovat i ikonou v adresním řádku.
- **iPhone a iPad**: Safari instalaci nabídnout neumí, ATLAS proto ukáže návod **Sdílet → Přidat na plochu → Přidat**.
- Spuštěnému z plochy se položka už nenabízí. Instalace a offline režim fungují jen přes https (Render) a na `localhost`.

**Offline funguje**: aplikace se otevře z uložené kopie (nahoře pruh „📴 Jsi offline“), plánovač s uloženými cestami,
rozpracovaná cesta z průvodce, hlídané ceny a navštívené země (vše je v localStorage prohlížeče), přehled zemí
s doporučeními, vstupní podmínky a mapa navštívených zemí. **Nefunguje** nic, co potřebuje server nebo cizí web – hledání
letů, ceny, ubytování, počasí, dlaždice map. Místo „Failed to fetch“ pak ATLAS napíše „Jsi offline – připoj se
k internetu a zkus to znovu.“ (při připojení, ale nedostupném serveru „Server ATLAS je teď nedostupný…“).

**Proč nikdy neukáže starý kód** (`public/sw.js`, `server/lib/pwa.js`, `public/js/pwa.js`):

- Service worker bere stránku i soubory aplikace (HTML, JS, CSS, `vendor/`, `data/*.json`) **vždy nejdřív ze sítě**
  s ověřením u serveru a každou úspěšnou odpověď si uloží; uloženou kopii použije, **jen když síť selže**. Na `/api/*`,
  jiné metody než GET a cizí weby (dlaždice map, písma, partneři) nesahá – jdou rovnou na server a nic z nich neukládá.
- **Pomalá síť nebo uspaný server** (Render zdarma po 15 minutách bez návštěvy usne a probouzí se až minutu): stránka,
  která ze sítě nepřijde do 1,5 s, se otevře z uložené kopie a **všechny její soubory taky** (stejná verze, nikdy směs
  staré stránky s novými skripty). `pwa.js` se od service workeru dozví, že stránka je z uložené kopie, vezme si její
  verzi a po probuzení serveru hned ověří, jestli není novější – pak nabídne „Obnovit“ (viz níže). Na stav serveru
  (`/api/health`) start čeká nejvýš 1 s, zdroje cen se doplní, až odpoví; trvá-li to přes 2,5 s, nahoře je pruh
  „Čekám na server ATLASu…“ s letadlem na trase, které po odpovědi „doletí“ a pruh zmizí.
- **Úvodní obrazovka aplikace na ploše** (`#launch` v `index.html`): navazuje na úvodní obrazovku Chromu, pak z ikony
  vylétne papírová vlaštovka, za letu se promění v letadlo (~0,9 s) a obrazovka se rozplyne do hotového přehledu;
  čeká-li se dál, letadlo přelétá přes obrazovku. S „omezeným pohybem“ v systému bez animací.
- Server posílá kód aplikace (HTML, JS, CSS, manifest) s `Cache-Control: no-cache`: prohlížeč se při každém načtení
  zeptá (nezměněný soubor = `304` bez dat). S `max-age` by otevřený panel po obnovení vzal soubor z paměti bez ptaní –
  ani service worker by se o tom nedozvěděl – a po nasazení by běžel starý kód. Obrázky, písma a data mapy mezipaměť mají dál.
- `/sw.js` skládá server: verze je otisk obsahu všech souborů v `public/` a uložených dat (ne čas změny – nasazení
  se stejnými soubory nic nezmění) a seznam souborů k uložení při instalaci je stránka + vše, na co odkazuje
  `index.html` (skripty, styly, manifest a jeho ikony) + `data/countries.json`, `data/entry.json` a mapa světa.
  Přejmenovaný skript se do seznamu dostane sám, chybějící soubor se vynechá.
- Nové nasazení = jiný `sw.js` → prohlížeč nainstaluje nový service worker, ten si uloží novou sadu souborů, hned
  převezme otevřené stránky a staré mezipaměti smaže. Verzi stránky nese stránka sama – server ji dosadí do
  `<meta name="atlas-build">` (`serveIndex` v `server/lib/pwa.js`, platí i pro uloženou kopii). Otevřená stránka porovná
  verzi se serverem (hlavička `X-Atlas-Build` z `HEAD /sw.js`) při načtení, **hned po návratu do aplikace či na panel**
  (nejvýš jednou za 15 s), po připojení k internetu a každých 30 minut:
  - **aplikace na ploše** se po návratu (pryč aspoň 30 s) **sama obnoví** – úvodní animace a nová verze –, pokud je
    „v klidu“: nikde kurzor, žádné otevřené okno, hledání ani výsledky a pohled s uloženým stavem (přehled, cesta,
    mapa, země, plánovač, doporučení);
  - jinak (a v prohlížeči vždy) ukáže **„✨ Je k dispozici nová verze ATLASu – Obnovit“** – nic se neobnoví samo, aby
    nezmizel rozepsaný formulář ani výsledky hledání.
- Ikonu, název a úvodní obrazovku nainstalované aplikace na Androidu má Android uložené v instalaci (WebAPK); Chrome
  je podle manifestu aktualizuje sám – manifest kontroluje při spuštění nejvýš jednou denně, u změny ikony či názvu se
  může zeptat „Aktualizovat?“. Obsah aplikace se přeinstalováním neřeší – ten je vždy nejnovější.
- Kontrola v prohlížeči: DevTools → Application → Manifest, Service workers a Cache storage (`atlas-<verze>`).

**Ikony** (`public/icons/`) mají stejnou značku jako favicon – papírové letadlo na přechodu barev ATLAS: 192 a 512 px,
maskovatelná 512 px pro Android, 180 px pro iOS a 96 px pro zkratky v manifestu. Maskovatelná má přechod přes celou
plochu a jen zaoblené rohy (0,17 strany) v barvě pozadí aplikace (`#080c1a`): na ploše a v přehledu aplikací ji Android
ořízne do kruhu či zaobleného čtverce (Xiaomi ukáže skoro celou plochu, rohy ale zaoblí víc – vidět je jen přechod), na
úvodní obrazovce ji Chrome ukáže celou – tmavé rohy splynou s pozadím a zbude zaoblená ikona, ne ostrý čtverec. Proto je
i `name` v manifestu jen „ATLAS“ (Chrome ho píše dole na úvodní obrazovku); úvodní obrazovka v aplikaci (`#launch`
v `index.html`) má stejnou ikonu i nápis na stejném místě, takže na sebe navazují. Vytváří je `npm run build:icons`
(`scripts/build-icons.mjs` bez závislostí: tvary vykreslí po pixelech s vyhlazením a PNG zakóduje přes `node:zlib`);
test hlídá, že uložené PNG odpovídají skriptu – po změně vzhledu ho stačí spustit znovu.

## Jak to funguje

```
prohlížeč (public/)                         server (server/, Node bez závislostí)
 ├ našeptávač míst  ── GET /api/places ──▶  places.js   české názvy, země, regiony, Open-Meteo geokódování
 ├ náhled letišť    ── GET /api/origins ─▶  airports.js 4 000 letišť s pravidelnými lety (OurAirports + OpenFlights)
 └ hledání          ── POST /api/search ─▶  search.js   letiště v okruhu → dotazy na poskytovatele → skládání
        ▲  NDJSON stream průběhu + výsledek     ├ providers/ryanair.js, wizzair.js, travelpayouts.js (+ mock.js)
        └──────────────────────────────────     ├ optimizer.js   nejlevnější kombinace tam/zpět, open-jaw, kalendář
                                                ├ fx.js          kurzy (open.er-api.com → ECB → orientační)
                                                └ cache.js       TTL cache (ceny 20–60 min, trasy 24 h)
```

- **Kamkoliv**: Ryanair a Travelpayouts vrátí nejlevnější lety do všech destinací jedním dotazem na letiště.
  Wizz Air se prochází trasu po trase v rámci rozpočtu dotazů. Když Ryanair vrátí termín, který nesedí na zadaný
  počet nocí nebo dny v týdnu, ATLAS dohledá ceny po dnech a termín složí přesně.
- **Konkrétní cíl**: pro každou dvojici letišť (domov × cíl) stáhne ceny po dnech oběma směry od všech aerolinek a
  optimalizátor najde nejlevnější kombinace v rámci počtu nocí – včetně návratu na jiné letiště v okolí.
- **Doprava na letiště** je odhad (`server/lib/access.js`): veřejnou dopravou vlak/bus do města letiště + cesta na letiště
  + příplatek přes hranici, autem palivo nebo nabíjení (spotřeba × aktuální cena z `server/lib/fuel.js`) + parkování podle
  počtu nocí (přičítá optimalizátor k celé cestě) + známky – viz [Doprava na letiště](#doprava-na-letiště).

### API

| Endpoint | |
|---|---|
| `GET /api/health` | stav zdrojů, kurzy |
| `GET /api/places?q=vid` | našeptávač (`ap:VIE`, `metro:LON`, `cc:CZ`, `rg:kanary`, `geo:lat,lon\|Název`) |
| `GET /api/origins?from=ap:BRQ&radius=200` | letiště, která se prohledají, se vzdáleností a cestou na letiště (`ground`); volitelně jako u hledání `groundMode`, `kmRate`, `carFuel`, `carCons`, `carPrice` (dřívější `carKmCzk`), `adults`, `trip=oneway` a `nights` (autem parkování na typickou délku cesty, výchozí 7). Odpověď má i `access` (použité volby a `fuelCc` – země domova, jejíž cena nafty a benzínu platí) |
| `GET /api/nearby?lat=49.2&lon=16.6&radius=250` | letiště v okolí bodu (nejvýš 15) s cestou na letiště (`ground`); volby jako u `/api/origins` (výchozí veřejnou dopravou), odpověď má i `access` |
| `GET /api/fuel` | aktuální ceny paliva v Kč/l po zemích `CZ`, `DE`, `AT`, `SK`, `PL`, `HU` – `{ diesel, petrol, date, source, label }` (`source` `czso` / `wob` / `builtin` / `demo`) – a `updated`, `sources`, `defaultFuel`, `lPer100`; `ev` = nabíjení elektroauta `{ default: 16, range: [13, 22], date: "2026-10-06", label, kwhPer100: 19, operators: [{ name, ac?, dc?, price?, note?, secondary?, text }] }`. Cache 1 h |
| `POST /api/search` | hledání, viz `normalizeQuery` v `server/lib/search.js`; odpověď je NDJSON (průběh, pak výsledek) |
| `GET /api/verify?from=BGY&to=BCN&out=2026-11-10&back=2026-11-14&adults=2` | živá cena a alternativy z Kiwi.com |
| `GET /api/stays?city=Milán&iata=BGY&checkin=…&checkout=…&adults=2` | ubytování seřazené podle poměru cena/hodnocení + odkazy na partnery (`links[]` s `prefill`: `full` / `city` / `none`; Trip.com, Agoda a Hostelworld s ID místa dohledaným u partnera, viz `PARTNER_LOOKUP`); bez `cc` se země dopočte z `lat`/`lon`, bez `cityEn` anglický název z geokódování (podle `gid` – ID GeoNames místa vybraného v hledání, jinak podle názvu v okolí) |
| `POST /api/stayplan` | trasa přes víc míst: návrh `{ arrival, departure, nights, transport, count?, exclude? }`, nebo přepočet `{ arrival, departure, transport, bases: [{ name, lat, lon, cc }], ground? }`. Přejezdy `{ km, carMin, transitMin, transitKind: 'rail'\|'bus', border: { from, to }\|null, basis: 'route'\|'estimate', hsr?: true, fast?: true, long, carUrl, transitUrl }` (`hsr` = odhad tempa rychlovlaku, `fast` = přímý vlak z tabulky jízdních řádů), `pending` = kolik tras autem se ještě počítá; u přepočtu i `bases[{ cc, country }]` a s `ground` (město, kam se jede vlakem/busem) `groundLegs`. Přepočet nad limitem přepočtů na IP odpoví bez nových tras z BRouteru |
| `GET /api/cars?pickup=BGY&dropoff=MXP&from=2026-11-10T09:00&to=2026-11-14T18:00` | předvyplněné odkazy na půjčovny |
| `GET /api/ground?from=ap:PRG&to=ap:VIE&date=2026-11-10&adults=2` | vlak nebo bus místo letadla: `from`/`to` jako v hledání (`ap:`, `metro:`, `geo:`, kód letiště) nebo `fromLat`/`fromLon`/`fromName`/`fromCc`; volitelně `flightCzk`, `trips` (2 = cena letu tam i zpět), `flightMin`, `live=0`. Odpověď `{ from, to, km, est: { minutes, czk, basis }, worth: { worth, rule, reason, doorMin }, why, links, live? }` – `live` (spoje RegioJetu) jen s datem; `why` = proč se po zemi nedá (ostrov, moře, daleko) |
| `GET /api/poi?lat=…&lon=…&radius=8` | místa k vidění (Wikidata + Wikipedie) |
| `POST /api/roadtrip` | výlety z místa: `mode` `day` (jednodenní) nebo `loop` (okruh s přespáním), `transport` `car` nebo `transit` (vlak a autobus), `interests` (`towns`, `sights`, `culture`, `nature`, `spa`, `kids`), `lat`, `lon`, `label`, `start`, `days`, `pace`, `exclude`, `include` |
| `POST /api/bike` | okruh na kole: `lat`, `lon`, `km` (5–150), `bike` (`road`, `trekking`, `gravel`, `mtb`), `scenery` (`city`, `mixed`, `nature`), `hills` (`flat`, `normal`, `hilly`), `variant` (jiná trasa) → délka, stoupání, čas, povrch, geometrie a odkazy do Mapy.com / Google Map |
| `POST /api/bike` (`kind: "train"`) | „Vlakem tam, na kole zpět“: navíc `label` a `cc` domova; odpověď má `station { name, lat, lon, cc }` a `train { idosUrl, googleUrl }`, trasa vede z nádraží domů. 404 = v dosahu není vhodné nádraží |
| `POST /api/hike` | pěší okruh: `lat`, `lon`, `km` (2–40), `scenery`, `hills`, `variant` → jako `/api/bike` + `trailPct` (značené trasy), `roadPct`, `descent`; čas chůze podle DIN 33466 |
| `GET /api/climate?iata=BKK` / `?lat=&lon=` / `?cc=TH` | dlouhodobé podnebí: `hi[12]`, `lo[12]` (průměrná denní maxima a minima °C), `p[12]` (srážky mm/měsíc), NASA POWER 2001–2020 |
| `POST /api/itinerary` | rozplánování míst do dnů (`lat`, `lon`, `start`, `end`, `arrivalTime`, `departureTime`, `pace`, `interests`, `exclude`, `include`) |
| `GET /api/diag` | živý test, jestli server dosáhne na jednotlivé zdroje |

Další pole hledání: `minTemp` (15–35 °C, jen teplé cíle; každá nabídka má `tempHi`, skupina `dest.climate`) a `bags`
(`none` / `cabin` / `checked`; poplatek `bagCzk` je započtený v `perPersonCzk`, `flightCzk` zůstává čistá letenka).
`openJaw` (výchozí `true`) = návrat i na jiné letiště v okolí domova a přílet / odlet z různých letišť cílového města;
autem (`groundMode: "car"`) se návrat vždy vrací na letiště odletu, kde auto stojí – `openJaw` pak platí jen pro cíl.

Doprava na letiště: `groundMode` `transit` (výchozí) / `car`, `kmRate` = násobek odhadu jízdného (0 = nepočítat,
výchozí 1; **bez `groundMode` jde o dřívější Kč/km a dělí se 1,1** – starší odkazy a hlídané ceny s `kmRate: 1.1` tak
dostanou výchozí odhad). Auto: `carFuel` `diesel` (výchozí) / `petrol` / `ev`, `carCons` = spotřeba na 100 km (nafta
a benzín 2–30 l, výchozí 6 / 7; elektro 8–40 kWh, výchozí 19), `carPrice` = vlastní cena v Kč/l (5–150) nebo Kč/kWh
(1–40), bez ní aktuální cena v zemi domova (`fuel.js`) a u elektroauta odhad nabíjení DC 16 Kč/kWh; Kč/km = `carCons` /
100 × cena. **Dotaz jen s `carKmCzk` (0,5–10) bez `carFuel`** – starší klienti, uložená hledání a odkazy – počítá jako
dřív silniční km × Kč/km. Dotaz (`query`) vrací `carFuel`, `carCons`, `carPrice` a `carKmCzk` (`null`, kromě dřívějšího
Kč/km, kde je naopak `carFuel` `null`). Každé letiště v `origins` má `ground`: veřejnou dopravou
`{ mode: "transit", km, minutes, czk, local, breakdown: [{ k, label, czk, min? }] }` (`czk` = na osobu jedním směrem,
`breakdown` = rozpis `intercity` / `regional` / `access` / `border`), autem `{ mode: "car", km, roadKm, minutes, czk,
fuelCzk, carKmCzk, carFuel, parkBaseCzk, parkDayCzk, tolls: [{ cc, czk, days, label }], adults, dropOff, breakdown }`
(`czk` = na osobu a let: palivo jedním směrem + půl známky; u `dropOff` – jen tam – palivo tam i zpět a celá známka;
`fuelCzk` = round(`roadKm` × `carKmCzk`); parkování online předem = `parkBaseCzk` + `parkDayCzk` × počet dní; `tolls`
a `breakdown` – `fuel` / `park` (`czk` za den, `base` základ) / `toll` – za auto). Položka
`fuel` navíc nese pohon a cenu: `{ fuel, cons, unit: "l" | "kWh", price, priceLabel, kmCzk, fuelCzk, custom, country,
date, source }` – `priceLabel` např. „nafta 50,65 Kč/l · ČSÚ, 40. týden 2026 (28. 9.–4. 10.)“, `source` `czso` / `wob` /
`builtin` / `demo` / `ev` / `custom` (u dřívějšího Kč/km jen `kmCzk` a `fuelCzk`). Vypnuto `off: true`, `czk: 0` a prázdný
`breakdown`. `/api/origins` autem navíc `ground.trip: { days, perPerson, fuel, park, tolls, total }`. Nabídky mají
`groundCzk` (doprava tam i zpět na osobu, autem i s parkováním) a autem tam i zpět `parkCzk` (parkování na osobu, podle
nocí té nabídky); `perPersonCzk = flightCzk + groundCzk + bagCzk + arrCzk`.

Cesta z letiště do města (`server/lib/arrival.js`): `"arrival": true` přičte k ceně jízdné z letiště příletu do města
a z města na letiště odletu (letiště domova ne) – i v řazení, kalendáři, `nearby`, `maxPrice` a u cesty přes víc měst;
**bez pole se nepřičítá** (dřívější klienti, odkazy a hlídané ceny), formulář ho posílá vždy. Nabídky mají `arrCzk`
(Kč/os. tam i zpět; u přesných dat i každý let), kombinace cesty přes víc měst taky. Odpověď má vždy (i s `arrival:
false`) `arrivals` – `{ "BVA": { iata, city, gen, lat, lon, mode: "bus" | "train" | "metro" | "tram", how, fare, cur,
from?, czk, min, km, note?, src, date, sec?, basis: "table" } }` k letištím příletu a odletu ve výsledcích (`gen` =
město ve 2. pádě, `from` = cena online předem, `sec` = sekundární zdroj); letiště z tabulky cesty na letiště
`basis: "access"`, ostatní `basis: "estimate"` s `est: true` (bez `fare`, `src`, `date`).

Přesná data: místo `dateFrom`/`dateTo` + nocí pošli `"exactOut": "2026-11-14", "exactBack": "2026-11-21"` (a volitelně
`"flexDays": 1` = každé datum ±1 den); u `"trip": "oneway"` stačí `exactOut`. U přesných dat se na den a trasu nechají
všechny přímé lety (+ lety s přestupem, nejvýš ~12 variant), Kiwi se ptá se seznamy letišť a zvlášť jen na přímé lety.
Odpověď navíc má `nearby` (konkrétní cíl: nejlevnější známá cena po dnech ±3 kolem odletu/návratu z už stažených dat,
`lowcostOnDay` / `lowcostNear` a česká nápověda `hint`, když v zadaný den Ryanair/Wizz nemá volný let – nelétá, nebo je
vyprodáno), lety Ryanairu a Wizz Air mají `otherDeps` (další odlety téhož dne bez ceny, Ryanair z letového řádu `timtbl`).
Ceny v `nearby` jsou vč. dopravy na domácí letiště (u návratu na letiště příletu), autem tam i zpět i s parkováním na
celou cestu, kdyby se změnil jen ten den (`parkCzk` Kč/os. na `parkDays` dní; den tam s návratem v zadaný den, den zpět
s odletem v zadaný den – stejně jako po kliknutí na den v pruhu). `hubs` = přestupní letiště, ze kterých
se u dálkových cílů hledalo navíc (i když z nich nic nevyšlo – UI je pak v nápovědě znovu nenabízí). Lety v `top`/`groups`
mají u přesných dat ke konkrétnímu cíli `groundCzk` a `bagCzk` (doprava na domácí letiště a zavazadla k tomu letu, Kč/os.)
– pohled ✈︎ Lety z nich spočítá i dvojici samostatných letenek, která mezi kombinacemi není. Návrat se s letem tam
nepáruje, když odlétá dřív než 2 h po jeho příletu.

Čas a přestupy: lety s přestupem z Kiwi.com mají `layovers` – `[{ "at": "MUC", "min": 95 }]`, čekání na každém přestupu v minutách spočítané z místních časů úseků (když čas některého úseku chybí, pole chybí). Let bez známého času příletu (Wizz Air) má vedle `arrEst: true` i `estMin` – odhad délky letu v minutách (vzdálenost / 780 km/h + 35 min), který UI používá jen pro filtr délky cesty; `durationMin` zůstává `null`. Filtry času a přestupů běží v prohlížeči (`public/js/searchhelp.js`), server se kvůli nim znovu neptá.

Je to dobrá cena: každá skupina má `priceStats` (`n`, `min`, `p25`, `median`, `p75`, `max`, `dateFrom`, `dateTo`, `mins`), u konkrétního cíle i `priceStats` celé trasy; každá nabídka má `priceLevel` (`level` `low` / `normal` / `high`, `basis`, `reason`, `ref`, `vsRef`, `pos`, `n`).

Cesta přes víc měst: `"trip": "multi", "legs": [{ "from": ["ap:PRG"], "to": ["metro:ROM"], "date": "2026-11-03" }, { "from": ["ap:NAP"], "to": ["ap:PRG"], "date": "2026-11-08", "flexDays": 1 }]` – 2 až 4 lety jedním směrem, data po sobě (týž den smí), nejvýš 90 dní. Cílem (a místem odletu dalších letů) musí být město nebo letiště, ne země. `radiusKm`, `kmRate`, `groundMode`, `carFuel`, `carCons`, `carPrice` (dřívější `carKmCzk`), `exclude` platí pro odlet 1. letu (autem s návratem domů parkování na celou cestu u 1. letu); když je cíl posledního letu stejný jako odkud 1. letu, letí se na kterékoliv letiště začátku cesty (s `openJaw: false` jen na letiště samotného místa; autem vždy na kterékoliv – nejlevnější kombinace se vrací tam, kde auto parkuje) a doprava z něj domů se přičte. Úseky se hledají nejvýš po dvou najednou s rozpočtem 24 dvojic letišť na zdroj. Průběh má navíc `legs: [{ label, state }]`. Odpověď má `mode: "multi"`, `legs: [{ label, from, to, date, flex, dest, options, count, nearby }]` (options = nejvýš 16 jednosměrných letů s `perPersonCzk` vč. dopravy a zavazadel), `links[i][a][b]` (`null` = let b úseku i+1 se po letu a stihne, jinak `{ why: "early" | "short" | "nextday" | "unknown", gapMin?, needMin?, move? }`; `unknown` = let a s přestupem bez známého příletu, další nejdřív 24 h po jeho odletu), `combos: [{ picks, perPersonCzk, totalCzk, flightCzk, groundCzk, bagCzk, arrCzk }]` (30 nejlevnějších navazujících cest), `returnsHome` a `stats.feasible`. `maxPrice` platí na celou cestu.

Skupiny v dosahu vlaku/busu mají `ground` (`km`, `min`, `czk`, `basis` – `measured` / `distance`, `worth`, `rule`,
`reason`, `doorMin`, `from`, `to`, `regiojet`, `flixbus` a `q` pro `/api/ground`); u hledání ke konkrétnímu cíli má
srovnání i celý výsledek (`ground` s `flightCzk` a `trips` nejlevnější cesty, i když se žádný let nenašel).

Každá odpověď má `filters` (`maxPrice`, `directOnly`, `active`, `hidden` = kolik nabídek filtr skryl) a u každého zdroje
v `providers` (i v průběhu) `failed`, `retried`, `outage` (`null` / `partial` / `down` / `blocked`), `retryable` a
`retryAfter` (s) – UI podle toho ukáže „Kiwi.com neodpovědělo“ s tlačítkem Zkusit znovu. Kiwi při 503/429/výpadku
spojení dotaz zopakuje (po 3 neúspěšných pokusech za sebou v jednom hledání už ne); na chvíli (1–3 min) se vynechá až po
výpadku ve dvou různých hledáních.

Příklad:

```bash
curl -N -X POST localhost:8080/api/search -H 'content-type: application/json' -d '{
  "from": ["geo:49.3961,15.5912|Jihlava"], "radiusKm": 200,
  "to": [], "dateFrom": "2026-11-01", "dateTo": "2026-11-30",
  "trip": "return", "nightsMin": 2, "nightsMax": 5, "adults": 2
}'
```

## Přejezdy mezi místy

Trasa přes víc míst ukazuje u každého přejezdu (i z letiště na první místo a z posledního na letiště) stejná čísla
v kroku Trasa, ve Shrnutí, v časové ose, v kalendáři (.ics) i v poznámkách cesty uložené do plánovače – počítá je server
(`server/lib/transfers.js`, pravidla a zdroje v `data/transfers.json`), prohlížeč je jen zobrazí. Podle nich je i čas
příjezdu v Programu; cesta z letiště na první místo a z posledního na letiště nad hodinu zkrátí program prvního
a posledního dne (hodinu kryje rezerva 1,5 h po příletu a 3 h před odletem). S vlakem/busem místo letu se počítá
cesta z města příjezdu (ne z letiště):

- **Autem:** silniční vzdálenost a čas bez kolon z plánovače tras [BRouter](https://brouter.de/) (profil `car-fast`,
  nad OpenStreetMap) × **provoz podle regionu** + 5 min na start a cíl ve městě + **zácpy**, začíná-li nebo končí-li
  přejezd v jedné z ~30 velkých metropolí (Lagos, Káhira, Nairobi, Dháka, Jakarta, Manila, Bangkok, Bombaj, Dillí,
  Ciudad de México, São Paulo, Lima, Istanbul…; +15–45 min, orientačně podle TomTom Traffic Index a INRIX) + **hranice**.
  Faktory platí navíc k času BRouteru, který už sám počítá s typem silnice – proto jsou menší, než by byly u
  „volného“ plánovače: západní a severní Evropa, USA a Kanada 1,1; jižní a východní Evropa (vč. Česka), východní Asie,
  Blízký východ a severní Afrika 1,15; Latinská Amerika 1,2; jihovýchodní Asie 1,35; jižní Asie 1,4; východní a
  střední Afrika 1,3; západní Afrika 1,0 (BRouter tam už jezdí ~60 km/h – Lagos → Porto Novo 123 min, OSRM 82 min).
- **Hranice:** v Schengenu (a mezi Británií a Irskem) nic; jinde autem +30 min v Evropě, +45 min mimo ni; autobusem
  +45 min v Evropě, +75 min jinde a **+2 h v Africe** (vystupují všichni, kontrola zavazadel, přestup do jiného
  minibusu). U přejezdu je *🛂 přechod hranice Nigérie → Benin – počítej s kontrolou a vízem* se stavem vstupních
  podmínek další země a odkazem na ně; autem upozorní, že s půjčeným autem přes hranici často nesmíš.
- **Veřejnou dopravou:** *🚆 vlakem / busem* jen v zemích, kde se mezi městy běžně jezdí vlakem (většina EU,
  Švýcarsko, Británie, Japonsko, Korea, Čína, Tchaj-wan, Indie…; a ne u místa, o kterém mezipaměť nádraží z výletů
  na kole ví, že u něj žádné není) – čas autem + 10–30 min na nádraží; mezi dvěma městy na vysokorychlostní trati
  v téže zemi (Itálie, Francie, Španělsko, Německo, Rakousko, Británie, Japonsko, Čína, Korea, Tchaj-wan) nejvýš
  40 min + 0,25–0,5 min/km vzdušnou čarou podle země (Čína 0,25; Francie, Španělsko, Japonsko, Tchaj-wan 0,3;
  Itálie 0,35; Británie a Korea 0,4; Německo 0,45; Rakousko 0,5 – Westbahn jezdí ~200 km/h se zastávkami). Jinde
  *🚌 autobusem / minibusem* – čas autem × 1,2 (Evropa) až 1,3 + 15–45 min čekání + hranice. Vždy „odhad“ (mimo
  tabulku přímých vlaků níže); odkaz do Google Map je „ověř spoje“.
- **Přímé rychlé vlaky podle jízdního řádu:** tabulka ~100 ověřených spojů mezi hlavními nádražími ~80 měst
  (`railLinks` v `data/transfers.json`) – Česko a sousedé (Praha–Brno/Olomouc/Ostrava/Pardubice/Plzeň/Drážďany/Berlín/
  Vídeň/Bratislava, Vídeň–Brno/Bratislava/Budapešť, Žilina–Košice, Koralmbahn Štýrský Hradec–Klagenfurt 42 min…),
  Německo, Polsko, Švýcarsko, Benelux, Paříž (Eurostar, TGV Lyria, ICE), Skandinávie, Finsko, Portugalsko, sever Itálie
  a pár rychlých tratí jinde: Al Boraq Tanger–Casablanca–Rabat, Acela New York–Washington/Filadelfie/Boston, YHT
  Istanbul–Ankara–Konya, Haramain Mekka–Medína, Afrosiyob Taškent–Samarkand–Buchara, Whoosh Jakarta–Bandung,
  Káhira–Alexandrie, Dillí–Ágra. Minuty = typický nejrychlejší **pravidelný** přímý vlak jízdního řádu 2026 (v každém
  směru 3. nejkratší jízda dne – ne jediný výjimečný spoj; průměr obou směrů; bez dočasných výluk) + **20 min** na cestu
  na nádraží, z něj a čekání. Leží-li obě místa do **15 km** od nádraží spoje, je přejezd vždy *🚆 vlakem* (i v zemi,
  kde se jinak jezdí autobusem) a trvá právě tolik – jízdní řád nahradí odhad z času autem, i když by vyšel kratší
  (Praha → Brno: odhad s trasou 2 h 50 min, vlak 2 h 37 min + 20 min = ~2 h 55 min), i odhad tempa rychlovlaku
  (Frankfurt → Mnichov 3 h 35 min místo 2 h 55 min). Místo **15–60 km** od nádraží jede přes uzel: místní spoj k nádraží (týž odhad jako jiné přejezdy)
  + 10 min přestup + spoj – ale jen když je to rychlejší než odhad (Lovaň → Brusel → Paříž ano, Baden → Vídeň → Brno
  ne); dál se spoj nepoužije. Letiště nikdy není „u nádraží“, cesta z něj k vlaku se počítá vždy. Hranice: v Schengenu
  nic, jinde jako u ostatních vlaků; Eurostar z/do Londýna má v minutách **odbavení 60 min** (Eurostar doporučuje přijít
  75 min před odjezdem v Londýně, 45–90 min jinde; kontrola pasů je jeho součástí), hranice se proto nepřičítá podruhé.
  K nádražím daleko za městem minuty navíc (Whoosh: Halim +25, Tegalluar +42; Buchara-Kogon +15). Takový přejezd má
  v odpovědi `fast: true` a průvodce u jeho času veřejnou dopravou píše jen *vlakem (jízdní řád)* místo *vlakem / busem
  (odhad)* – v trase, shrnutí, kalendáři i poznámkách plánovače (Vídeň → Brno *~1 h 50 min vlakem (jízdní řád)*).
- **Zdroje tabulky (ověřeno 6. 10. 2026):** ÖBB Scotty (fahrplan.oebb.at – jízdní řády evropských železnic v systému
  HAFAS): všechny přímé vlaky dne v út 27. 10. a čt 12. 11. 2026 (při výluce – méně vlaků, objížďka – hodnota ze dne bez
  ní, kontrolně út 13. 10.); Amtrak GTFS (feed z 6. 10. 2026); seat61.com (Maroko, Turecko, Uzbekistán, Indie, Indonésie –
  stránky z června až září 2026); blog.wego.com a Saudipedia (Haramain, 2026); ask-aladdin.com (Egypt 2026); eurostar.com
  (odbavení). Vynechané: Casablanca–Marrákeš (od 9/2025 výluky kvůli stavbě rychlotrati Kenitra–Marrákeš, jízdní
  řád se mění), Madrid–Lisabon (přímý vlak v roce 2026 nejezdí), Budapešť–Bělehrad (v jízdním řádu 2026 žádný spoj,
  provoz po nové trati odložený), Lublaň–Záhřeb (5 vlaků denně, pomalejší než autobus), Bangkok–Ajutthaja (vlak není
  jasně rychlejší); Barcelona–Paříž jezdí přímo jen 2× denně, proto typický dobrý spoj i s přestupem (~6 h 55 min).
- **Bez trasy** (BRouter neodpoví, je mimo rozpočet, přejezd delší než 500 km vzdušnou čarou, DEMO) platí stejná
  pravidla nad odhadem ze vzdušné vzdálenosti (zajížďka 1,2–1,35, rychlost podle regionu) a u času autem je
  „odhad“ místo „podle trasy“.
- **Ohleduplně k BRouteru:** jeden dotaz naráz, aspoň 1 s mezi dotazy (společná fronta s trasami na kole), nejvýš
  20 čekajících; na jeden přepočet trasy nejvýš 8 nových výpočtů a 9 s čekání – co nedoběhne, počítá se dál na pozadí
  (a co se do 8 nevešlo, spočítá další přepočet) a prohlížeč si to za pár sekund vyžádá znovu (nejvýš 3×). Trasy
  se ukládají 30 dní podle bodů zaokrouhlených na ~1 km a bez ohledu na směr, takže úprava trasy už spočítané úseky
  znovu nepočítá; nenalezená trasa 6 h, výpadek 10 min.
  Střed města v pěší zóně („target island“) se zkusí znovu s body o kus blíž k sobě, jiná chyba výpočtu profilem `car-eco`.
  Přepočty trasy z jedné IP mají vlastní limit – 3× `SEARCH_RATE_LIMIT` za 10 minut, zvlášť od hledání (do jeho limitu se
  nepočítají) a počítá se jen přepočet, který opravdu potřebuje novou trasu. Nad limitem přepočet neodmítne (žádné 429),
  jen nespustí nové výpočty: trasy z mezipaměti, ostatní odhadem (a ne „pending“, prohlížeč se znovu neptá).
- **Návrh trasy** počítá s týmiž časy: běžný přejezd je nejvýš ~3 h 20 min autem a ~3 h 45 min veřejnou dopravou
  (6hodinový přejezd přes hranici tedy „krátký“ není); když skutečná trasa ukáže delší přejezd než odhad, návrh se
  jednou zopakuje s ní.

**Kalibrace** (čas BRouteru z 6. 10. 2026 → výsledek):

| Přejezd | Autem | Veřejnou dopravou |
|---|---|---|
| Lagos → Porto Novo (122 km, hranice Nigérie–Benin) | ~3 h 25 min (skutečně 3 h a víc) | 🚌 ~6 h 10 min (skutečně ~6 h) |
| Porto Novo → Abeokuta (208 km, hranice) | ~3 h 55 min | 🚌 ~6 h 50 min – vlak tam nejezdí |
| Praha → Brno (208 km) | ~2 h 20 min | 🚆 ~2 h 50 min |
| Milán → Boloňa (215 km) | ~2 h 40 min | 🚆 ~1 h 50 min (rychlovlak) |
| Vídeň → Salcburk (296 km) | ~3 h 15 min | 🚆 ~2 h 45 min (Railjet 2 h 25 min + 20 min, z tabulky spojů) |
| Paříž → Lyon (463 km) | ~4 h 35 min | 🚆 ~2 h 15 min (TGV 1 h 55 min + 20 min, z tabulky spojů) |

**Přímé vlaky z tabulky** (odhad bez trasy z BRouteru; dřív = čas autem + nádraží, v závorce jízdní řád 2026):

| Přejezd | Dřív | Teď |
|---|---|---|
| Vídeň → Brno | 🚆 2 h 30 min | 🚆 1 h 50 min (Railjet 1 h 31 min) |
| Praha → Pardubice / Olomouc / Ostrava | 🚆 2 h 20 / 3 h 30 / 4 h 25 min | 🚆 1 h 15 / 2 h 35 / 3 h 40 min (57 min / 2 h 14 / 3 h 18) |
| Krakov → Varšava | 🚆 4 h 05 min | 🚆 2 h 45 min (EIP 2 h 27 min) |
| Curych → Bern | 🚆 2 h 10 min | 🚆 1 h 15 min (IC 56 min) |
| Brusel → Paříž | 🚆 3 h 55 min | 🚆 1 h 45 min (Eurostar 1 h 26 min) |
| Londýn → Paříž | 🚆 5 h 25 min | 🚆 3 h 50 min (Eurostar 2 h 28 min + odbavení 60 min) |
| Frankfurt → Mnichov | 🚆 2 h 55 min (odhad tempa VRT) | 🚆 3 h 35 min (ICE 3 h 16 min) |
| Stockholm → Göteborg | 🚆 5 h 35 min | 🚆 3 h 50 min (3 h 28 min) |
| Tanger → Casablanca | 🚌 5 h 55 min | 🚆 2 h 30 min (Al Boraq 2 h 10 min) |
| New York → Washington | 🚌 5 h 50 min | 🚆 3 h 20 min (Acela 2 h 58 min) |
| Lovaň → Paříž (26 km od Bruselu) | 🚆 4 h 05 min | 🚆 3 h 00 min (přes Brusel) |
| Baden → Brno (23 km od Vídně) | 🚆 2 h 40 min | 🚆 2 h 40 min (přes Vídeň by to bylo pomalejší) |

## Omezení (upřímně)

- Ryanair a Wizz Air nemají veřejné API pro vývojáře; ATLAS používá stejná rozhraní jako jejich weby. Když je změní,
  je potřeba upravit adaptér (testy v `test/providers.test.js` popisují očekávaný tvar odpovědí).
- Ceny jsou základní tarif bez příplatků. Kabinový nebo odbavený kufr umí ATLAS přičíst (🧳 Zavazadla v „Další možnosti“),
  ale jen jako odhad podle dopravce (`server/lib/baggage.js`, stav 10/2026) – přesnou cenu ukáže až rezervace.
- Kombinace dvou aerolinek / různých letišť jsou **dvě samostatné letenky** – při zpoždění prvního letu druhá aerolinka
  nečeká. Aplikace to u výsledku označí.
- Doprava na letiště je jen odhad: jízdné podle vzdálenosti a tabulky cest na ~35 letišť (ne jízdní řád ani živé ceny),
  parkování online předem jako základ + sazba za den (18 letišť proložených ceníky ověřenými 10/2026 – u týdenních ceníků
  přesně jen na 3–14 dní –, ostatní odhad; skutečná cena se mění se sezónou a obsazeností) a dálniční známky podle
  orientačních ceníků 2025/26. Cena nafty a benzínu je celostátní týdenní průměr
  (u dálnice bývá vyšší, za hranicí platí cena země, odkud jedeš), spotřeba je zadaná, ne podle auta, rychlosti a zimy;
  elektroauto počítá s rychlonabíjením za odhad 16 Kč/kWh. Autem se nepočítá opotřebení auta ani mýtné za úseky
  v Polsku; u cesty přes víc měst si ručním výběrem letů můžeš složit i návrat na jiné letiště, než kde auto parkuje
  (cena pak počítá, jako by ses vrátil k autu).
- Cesta z letiště do města: jízdné z ověřené tabulky (74 letišť, 7. 10. 2026) se mění – dopravci zdražují, „od“ platí
  jen online předem a u řidiče nebo ve špičce bývá dráž; čas je typická jízda bez čekání (po půlnoci letištní bus často
  nejede a zbývá taxi). Počítá se jízdenka pro dospělého na osobu do jednoho místa v centru (nádraží, terminál), ne
  k ubytování – rodinné, skupinové a časové jízdenky, slevy pro děti ani taxi pro víc lidí se nepočítají. Ostatní
  letiště jsou odhad podle vzdálenosti a cenové hladiny země. U letovisek (Antalya, Hurghada, Šarm aš-Šajch) cesta
  do centra města neříká nic o cestě do hotelu v letovisku – tam se obvykle jede transferem nebo taxi, které stojí víc.
- Přejezdy mezi místy trasy: čas autem je z trasy BRouteru s **průměrnými** faktory provozu a hranic – skutečná zácpa,
  stavba nebo fronta na hranici může cestu prodloužit o hodiny. Veřejná doprava je odhad z času autem, jen mezi městy
  z tabulky ~100 přímých vlaků čas podle jízdního řádu 2026 (typický nejrychlejší pravidelný spoj – ne každý vlak tak
  jede, výluky, zpoždění ani změny jízdního řádu po 12. 12. 2026 v ní nejsou; živé jízdní řády ATLAS nenačítá) – konkrétní
  spoj ověř přes odkaz. Země bez kódu z Wikidat se dopočítá podle nejbližšího letiště, takže
  u místa těsně u hranice může vyjít sousední země (Basilej → Francie).
- Odkazy na partnery ubytování: Booking.com, Airbnb, Hotels.com, Kayak a Google Hotels dostanou místo, data i počet hostů
  (Kayak „Město-Země“ anglicky, protože samotné jméno víceznačné místo pošle jinam – Lagos do Portugalska, a na české
  verzi cz.kayak.com, která se otevře česky s cenami v Kč – stejně odkaz na půjčení auta; Google Hotels
  termín a hosty v parametru `ts`, jehož formát Google nezveřejňuje – kdyby ho změnil, zůstane jen místo). Trip.com,
  Agoda a Hostelworld potřebují k předvyplnění své vlastní ID místa: server ho u každého jednou dohledá – Trip.com
  v našeptávači svého webu (`cityId`; ze stejnojmenných měst to nejbližší k místu, nejvýš 50 km – „Porto Novo“ je
  i na Kapverdách), Agoda ze stránky města `/city/<město>-<země>.html`, Hostelworld ze stránky města (odkaz na jeho
  hledání) – a výsledek drží v mezipaměti 30 dní (chybu hodinu). Na místo a partnera je to jeden dotaz s timeoutem 4 s
  bez opakování, souběžně s hledáním hotelů, a když selže, hledání ubytování nespadne. S ID odkaz rovnou ukáže nabídky
  na termín a hosty. Kde ID není (Agoda nemá stránku Porto-Novo), nebo kdyby partner svůj web změnil, zůstane dosavadní
  odkaz: Trip.com vyplní místo, termín i hosty do formuláře (hledání potvrdíš), Agoda otevře úvodní stránku, Hostelworld
  stránku města (data zadáš). Místo, kde Hostelworld hostely nemá – stránka města chybí (404) nebo v záhlaví hlásí
  „0 Hostels in …“ a odkaz s ID nemá (Lagos, Porto-Novo, Abeokuta, Mikulov, Telč 10/2026; i s daty by na ní nic nebylo)
  –, dostane stránku země s poznámkou „v místě hostely nemá – zkus jinde v zemi“ a odkaz se přesune na konec seznamu.
  `PARTNER_LOOKUP=0` dohledávání vypne, DEMO se partnerů neptá. Ověřeno 6. a 7. 10. 2026 ve skutečném Chromu (Hotels.com
  předvyplní místo, termín i hosty; Trip.com zůstává anglicky v USD – česká verze s Kč neexistuje).
- Vlak mimo tabulku přímých spojů je čas autem + cesta na nádraží: na regionálních tratích sedí, na rychlé trati,
  která v tabulce chybí, bývá ve skutečnosti kratší (mezi městy z tabulky platí jízdní řád – Vídeň → Brno ~1 h 50 min).
- Cesta přes víc měst = samostatné letenky na každý let; přejezdy mezi městy (třeba Řím → Neapol) ATLAS nepočítá do ceny ani nehledá.
- Vlak/bus je mimo změřené trasy z Prahy jen **odhad podle vzdálenosti** (Alpy a Dinárské hory s přirážkou ~25 %) –
  pomalé tratě bez hor bývají delší (Praha–Linec, Ostrava–Krakov), rychlé kratší (Praha–Ostrava 3 h 16 místo ~4 h 15).
  Živé spoje má jen RegioJet – a do Rakouska ukazuje i pomalé spoje s přestupem přes partnery; ostatní dopravce ukáže
  až odkaz. Cena „od ~X Kč“ je kalibrovaná na nejnižší ceně RegioJetu i FlixBusu – kde jezdí jen RegioJet, bývá
  skutečná cena vyšší (Praha–Frankfurt: RegioJet od 739 Kč, odhad ~380 Kč; FlixBus může být levnější, ATLAS ho nenačítá).
- Kolín nad Rýnem vede RegioJet jen jako zastávku letiště Kolín/Bonn: v datech je to město Kolín (odkazy na Köln),
  spoje RegioJetu ale končí na letišti. Místa, která v `data/ground.json` nejsou (Lutych, Terst, Zelená Hora), mají
  v odkazech do IDOS a Google Map český název – ten tam nemusí projít.
- Odkaz na RegioJet nese jeden `tariffs=REGULAR` na cestujícího – tak adresu skládá i web RegioJetu (počet cestujících
  = počet tarifů). Odkazy RegioJet, FlixBus i IDOS jsou ověřené v prohlížeči 6. 10. 2026 (předvyplní města, den
  i počet cestujících a rovnou hledají).
- Podmínky Ryanairu zakazují automatické stahování dat pro komerční účely – aplikace je určená pro osobní použití.
  Pro komerční provoz je potřeba smluvní zdroj dat (např. Travelpayouts / Aviasales jako affiliate partner).
- Hlídané ceny se kontrolují jen v otevřeném a viditelném panelu prohlížeče (data jsou v localStorage, server nemá účty
  ani úložiště a bezplatný Render usíná). Zavřená stránka nehlídá nic.
- „Za teplem“ pracuje s dlouhodobými průměry z buněk 0,5° kolem letiště; u pobřežních letovisek bývají o 1–4 °C nižší
  než skutečnost (buňka zahrnuje i moře). Předpověď počasí jde nejvýš 15 dní dopředu.
- Bezpečnostní hodnocení zemí odpovídá doporučením MZV ČR k 5. 10. 2026 – před cestou si je vždy ověř na webu MZV.
- Vstupní podmínky jsou stav k 10/2026 pro turistickou cestu s běžným pasem; ceny registrací a víz jsou orientační
  (přepočet z místní měny) a datum platnosti pasu se počítá pro jistotu od návratu.
- Render může pozastavit bezplatnou službu, která volá externí API v neobvykle velkém objemu; proto má server
  limit hledání na IP (`SEARCH_RATE_LIMIT`) a strop dotazů na Wizz Air (`WIZZ_MAX_CALLS`).

## Data a licence

- Letiště: [OurAirports](https://ourairports.com/data/) (public domain) + názvy měst a časová pásma z
  [OpenFlights](https://openflights.org/data) (ODbL). Aktualizace: `npm run build:airports`.
- Geokódování a počasí: [Open-Meteo](https://open-meteo.com/) (předpověď CC BY 4.0). Kurzy: open.er-api.com, ECB.
- Ceny paliva: ČSÚ (DataStat, sada CENPHMT, CC0) a Evropská komise – Weekly Oil Bulletin; ceny nabíjení elektroaut:
  ceníky provozovatelů (ČEZ, PRE, E.ON, IONITY; Shell, MOL a Tesla ze sekundárních zdrojů) k 6. 10. 2026.
- Cesta z letiště do města: ceníky letišť, dopravců a dopravních svazů (zdroj u každého letiště v `data/arrival.json`
  a v tabulce [Z letiště do města](#z-letiště-do-města), ověřeno 7. 10. 2026), kurzy ČNB.
- Vlak a bus: seznam měst a zastávek RegioJetu (`brn-ybus-pubapi.sa.cz/restapi/consts/locations`), UUID měst FlixBusu
  (jen pro odkazy), změřené spoje z Prahy z průzkumu `research/ground.md` (větev `pc-research`); sestavuje `node scripts/build-ground.mjs` do
  `data/ground.json` (zdroj a datum jsou v souboru).
- Podnebí: [NASA POWER](https://power.larc.nasa.gov/) Climatology API (MERRA-2, 2001–2020), sestavuje
  `node scripts/build-climate.mjs` do `data/climate.json`.
- Země: cenová hladina podle Světové banky (PPP / směnný kurz, upravená na turistické ceny), bezpečnost podle MZV ČR,
  FCDO a US State Dept. Vstupní podmínky (`data/entry.json`): MZV ČR, oficiální weby e-víz a registrací, WHO a CDC.
- Před cestou (`public/data/pretrip.json`): MZV ČR, Kancelář zdravotního pojištění, VZP, Portál veřejné správy, OSN
  (úmluvy o silničním provozu), gov.uk; zásuvky a napětí z Wikipedie (CC BY-SA 4.0), viz
  [Před cestou: co zařídit a co sbalit](#před-cestou-co-zařídit-a-co-sbalit).
- Vlajky na Windows: písmo Twemoji Country Flags (Twemoji, CC BY 4.0; detekce z country-flag-emoji-polyfill, MIT),
  přibaleno v `public/vendor/flags/`.
- Mapa světa: d3, topojson-client, world-atlas (ISC, přibaleno v `public/vendor/`).
- Mapy míst: MapLibre GL JS (BSD-3-Clause, přibaleno v `public/vendor/maplibre/`), podklad OpenFreeMap
  (© OpenMapTiles, data © přispěvatelé OpenStreetMap, ODbL), záloha dlaždice OpenStreetMap.
- Trasy na kole a přejezdy autem mezi místy trasy: [BRouter](https://brouter.de/) (veřejný server, bez klíče; jiný
  server přes `BROUTER_URL`), data © přispěvatelé OpenStreetMap. Odkazy do [Mapy.com](https://mapy.com/) přes jejich veřejné URL API (bez klíče).
- Původní jednosouborová verze aplikace je pro srovnání v `legacy/ATLAS-puvodni.html`.
