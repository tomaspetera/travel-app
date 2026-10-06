# ATLAS – nejlevnější letenky odkudkoliv kamkoliv

Cestovní aplikace, která **skutečně hledá letenky**: napíšeš „Brno“, „Vídeň“, „Česko“, „Jihlava“ nebo použiješ polohu,
ATLAS najde všechna letiště v okolí, prohledá je najednou u více aerolinek a ukáže nejlevnější lety **kamkoliv na světě**
(nebo do konkrétního cíle) – včetně ceny cesty na letiště.

Z vybraného letu pak průvodce **Cesta** poskládá celou dovolenou: **let → ubytování → auto → program → shrnutí**
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

1. **Let** – v hledání klikneš u letu na *Vybrat a pokračovat*. Tlačítkem *Ověřit živou cenu* se dotáže Kiwi.com
   na přesnou cenu a nabídne i jiné aerolinky na stejný termín (low-cost i klasické, přestupy, kombinace).
   U blízkého cíle můžeš místo letu zvolit *🚆 Pojedu vlakem / busem* (viz [Vlak nebo bus místo letadla](#vlak-nebo-bus-místo-letadla)).
2. **Ubytování** – nabídky na tvoje data seřazené podle **nejlepšího poměru cena / hodnocení** (hodnocení je očištěné
   o malý počet recenzí, takže 10/10 ze 2 recenzí nepřebije 8,9 z 2 000). Přepneš na nejlevnější, nejlépe hodnocené
   nebo nejblíž centru, filtruješ 7+/8+/9+, typ a max. cenu za noc. Bez klíče LiteAPI dostaneš předvyplněné hledání
   na Booking.com (seřazené podle hodnocení a ceny), Airbnb, Google Hotels a Hostelworld a cenu jen zapíšeš.
3. **Auto** (nepovinné) – vyzvednutí na letišti 45 min po příletu, vrácení 2 h před odletem, předvyplněné srovnávače.
4. **Program** – místa k vidění kolem ubytování rozdělená do dnů podle polohy (den příletu a odletu je kratší),
   každý den jako pěší trasa s odkazem do Google Map; volíš zájmy a tempo, místa můžeš vyřadit nebo přidat.
5. **Shrnutí** – cena celkem a na osobu, co zarezervovat a v jakém pořadí, **🛂 Před cestou** (doklady, registrace
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

## V čem je lepší než Skyscanner

| | ATLAS |
|---|---|
| **Odlet odkudkoliv** | Zadáš město, obec, zemi nebo polohu → prohledá *všechna* letiště v okruhu (např. z Jihlavy PED, BRQ, PRG, VIE, BTS, LNZ…). Letiště lze ručně vyřadit. |
| **Cena včetně cesty na letiště** | Ke každé letence přičte odhad dopravy na letiště (vzdálenost × Kč/km, nastavitelné). Let z Vídně za 600 Kč tak férově porovná s letem z Brna za 900 Kč. |
| **Kamkoliv z více letišť** | Jedno hledání = všechny destinace ze všech letišť v okolí, seskupené podle města (Londýn = STN + LTN + LGW…). |
| **Dálkové lety** | Cílem může být i světadíl (Asie, Afrika, Blízký východ, Amerika, Oceánie). Do vzdálených zemí se hledá i z velkých přestupních letišť v okolí (Vídeň, Mnichov, Berlín…) – cena cesty na ně je započtená. |
| **Kombinace, které jinde nenajdeš** | Tam s Ryanairem, zpět s Wizz Air. Odlet z Vídně, návrat do Bratislavy. Přílet do Bergama, odlet z Malpensy. Optimalizátor skládá i takové cesty. |
| **Víc měst v jedné cestě** | *🗺️ Víc měst*: 2–4 lety jedním směrem (třeba Praha → Řím, Neapol → Praha), každý na přesné datum ± 0–3 dny; rychlá volba *↩ Návrat z jiného města*. Každý let se hledá zvlášť a ATLAS skládá jen lety, které na sebe navazují: na stejném letišti aspoň 3 h, z jiného letiště téhož města 5 h, z jiného města nejdřív další den a aspoň 8 h po příletu. Ve výsledku vybíráš let po krocích (nenavazující lety zešednou s důvodem), vidíš nejlevnější kombinace a ke každému letu tlačítko Koupit – jsou to samostatné letenky. Dva lety tam a zpět domů pokračují do průvodce cestou, delší cesta se uloží do plánovače i s lety v kalendáři (.ics). |
| **Kalendář celých cest** | V režimu konkrétního cíle ukáže pro každý den nejlevnější *celou cestu tam a zpět* (se zadaným počtem nocí), ne jen jednosměrný let. |
| **Přesná data i flexibilně** | *📅 Přesná data*: zadáš den odletu a návratu a hledá se jen v tyto dny (volitelně ±1–3 dny). Pohled *✈︎ Lety* ukáže jako Google Flights všechny nalezené lety tam a zpět zvlášť (čas, aerolinka, přímý / s přestupem, cena celé cesty, další odlety dne bez ceny), pruh *📅 Nejbližší dny* ceny ±3 dny kolem data a jedním kliknutím hledá jiný den. *🔀 Flexibilně*: rozsah dat odletu + počet nocí, víkendy (čt/pá/so → ne/po), prodloužené víkendy, vlastní dny v týdnu. |
| **Čas a přestupy** | Filtr *🕐 Čas a přestupy* ve výsledcích filtruje hned, bez nového hledání: čas odletu tam i zpět (ráno 5–12, odpoledne 12–18, večer 18–24, v noci 0–5 h, víc najednou), přílet nejpozději do 18 / 20 / 22 h nebo před půlnocí (přílet v noci 0–5 h se počítá jako pozdní, ráno dalšího dne ne), jen přímé lety nebo max. 1 přestup, max. délka cesty jedním směrem a nejdelší přestup (posuvníky podle nalezených letů). Časy jsou místní časy letišť. Platí v seznamu, na mapě, v kombinacích, v kalendáři i ve sloupcích ✈︎ Lety – tam jen pro svůj směr (když chceš návrat ráno, zůstanou všechny lety tam a každý se spáruje s nejlevnějším ranním návratem jako dvě samostatné letenky). Aktivní filtry jsou čipy s počtem skrytých nabídek a ✕, chytrá nápověda je nabídne zrušit. Lety bez známého času, délky nebo časů přestupů se neskrývají. U letů s přestupem je vidět, kde a jak dlouho se čeká („1× přestup (MUC 1 h 35 min)“). |
| **Chytrá nápověda** | Když je výsledků málo nebo žádné, nabídne konkrétní úpravy jedním kliknutím (± dny, přestupní letiště, celá země / světadíl, jen tam, celý měsíc, zrušit filtr) a průvodce *💡 Jak hledat chytře* pro dálkové lety. Aktivní filtry jsou vidět jako čipy s ✕, výpadek Kiwi.com hlásí s tlačítkem *Zkusit znovu*. |
| **Skóre výhodnosti** | 🔥 Super cena / 👍 Výhodné podle vzdálenosti a ostatních výsledků, ↓ zlevnění (Ryanair posílá předchozí cenu), ☀️ ideální sezóna z dat ATLAS. |
| **Je to dobrá cena?** | U každé nabídky štítek 💚 Dobrá cena / Běžná cena / 🔺 Dráž než obvykle a panel s vysvětlením: srovnání s ostatními nabídkami do stejného cíle v tomto hledání, s průměrnou cenou na vzdálenost a s tím, co ATLAS na trase viděl dřív (trend ↓ / → / ↑), plus opatrná rada, jestli koupit, nebo cenu hlídat – viz [Je to dobrá cena?](#je-to-dobrá-cena). |
| **Vlak nebo bus místo letadla** | U blízkých cílů v Evropě odhad cesty vlakem/busem, srovnání s letadlem od dveří ke dveřím a na vyžádání skutečné spoje RegioJetu s cenami; FlixBus, IDOS a Google Mapy jako odkazy. |
| **Mapa výsledků** | Všechny destinace na mapě obarvené podle ceny. |
| **Kam za teplem** | Volba 🌡️ Za teplem (≥ 20 / 25 / 30 °C) pustí jen cíle, kde je v měsíci odletu dlouhodobě aspoň tolik stupňů (NASA POWER, průměr 2001–2020). U každé nabídky je štítek s teplotou a řazení „Nejtepleji“. |
| **Cena i se zavazadly** | 🧳 Zavazadla (kabinový kufr / kufr k odbavení) přičte odhad poplatku podle dopravce (~95 aerolinek, ověřeno na jejich webech 10/2026) – nízkonákladovky se tak férově porovnají s klasickými aerolinkami. |
| **Hlídání cen + živý radar** | Ulož hledání ♡ a nastav cílovou cenu. Dokud máš ATLAS otevřený v prohlížeči, kontroluje ho sám zhruba jednou za 6 h, kreslí vývoj ceny a při zlevnění o 3 % nebo pod cílovou částku se ozve (i upozorněním prohlížeče). Radar ukazuje nejlevnější lety z tvého okolí na příštích 6 týdnů. |

## Odkud bere ceny

| Zdroj | Co dává | Klíč |
|---|---|---|
| **Ryanair** (Fare Finder API webu ryanair.com) | živé ceny, „kamkoliv“ jedním dotazem na letiště, ceny po dnech | není potřeba |
| **Wizz Air** (API webu wizzair.com – mapa tras + `timetableV2`) | živé ceny po dnech na trasách | není potřeba |
| **Kiwi.com** (veřejný MCP server `mcp.kiwi.com`) | živé ceny všech aerolinek (low-cost i klasické, přestupy, kombinace různých aerolinek) – do konkrétního cíle, do zemí a světadílů (dotaz na každou oblíbenou zemi), „kamkoliv“ (Evropa + dálkové země) a při ověření vybraného letu | není potřeba |
| **Travelpayouts / Aviasales Data API** | všechny ostatní aerolinky (i s přestupy, dálkové lety), ceny z vyhledávání uživatelů za posledních ~48 h | **zdarma** token z [travelpayouts.com](https://www.travelpayouts.com/) |
| **LiteAPI** (ubytování) | hotely s cenou na zadané dny, hodnocením hostů a fotkou | **zdarma** klíč z [liteapi.travel](https://www.liteapi.travel/) |
| **Wikidata + Wikipedie** (program) | místa k vidění, typ, význam, fotky, české popisy | není potřeba |

> Amadeus Self-Service API bylo v červenci 2026 vypnuto a Kiwi Tequila ani Skyscanner API nepřijímají nové vývojáře
> (Kiwi.com je proto napojené přes svůj veřejný MCP server; jeho podmínky pro neagentní použití nejsou zveřejněné –
> kdyby ho Kiwi omezilo, vypne se `KIWI_ENABLED=0` a zbytek běží dál),
> proto ATLAS staví na zdrojích výše. Adaptéry jsou oddělené (`server/providers/`), další zdroj se přidá jedním souborem.

Ceny Ryanair a Wizz Air jsou živé, ale do rezervace se mohou změnit; ceny z Travelpayouts jsou označené „⏱ z cache“
a je dobré je ověřit (u každého výsledku je odkaz na rezervaci a na ověření v Google Flights / Skyscanneru).

## Je to dobrá cena?

U každé nabídky letenky je štítek **💚 Dobrá cena**, **Běžná cena** nebo **🔺 Dráž než obvykle** (u nejlepších nabídek **🔥 Super cena**). Kliknutím na štítek nebo na odkaz „Je to dobrá cena?“ se otevře vysvětlení – u výsledků, u vybrané cesty v pohledu ✈︎ Lety i v průvodci cestou v kroku Let. Panel ukazuje:

- **Oproti ostatním nabídkám do stejného cíle v tomto hledání**: pozice ceny mezi všemi nalezenými nabídkami (ne jen zobrazenými) – nejlevnější, čtvrtina nejlevnějších, medián, rozpětí dat.
- **Oproti průměrné ceně na tuto vzdálenost**: hrubé pravidlo podle kilometrů. Výhodná je letenka zhruba od 40 % pod průměrem, dražší než obvykle od 25 % nad ním. Když je nabídek k porovnání méně než 5, řídí se odhad jen tímhle pravidlem a řekne to.
- **Co ATLAS na této trase viděl**: prohlížeč si pamatuje nejlevnější letenku z každého hledání podle trasy (letiště → město, měsíc odletu, zpáteční / jen tam) a kdy ji viděl. Při opakovaném stejném hledání (aspoň po 6 h, třeba při hlídání ♡) ukáže trend ↓ / → / ↑. Paměť je jen v tomto prohlížeči (localStorage), drží nejvýš 300 tras a zapomíná minulé měsíce a trasy neviděné přes 120 dní.
- **Do odletu** a opatrná rada: nízká cena krátce před odletem → spíš koupit; víc než ~7 týdnů do odletu → hlídat cenu ♡ s cílovou cenou; jinak zkusit jiné dny nebo letiště. Ceny u nízkonákladovek se před odletem obvykle zvedají.

Je to odhad, ne předpověď: porovnává se cena letenek na osobu bez dopravy na letiště a zavazadel.

## Vlak nebo bus místo letadla

Do blízkých měst (Vídeň, Berlín, Mnichov, Budapešť, Krakov…) bývá vlak nebo autobus stejně rychlý jako letadlo
i s cestou na letiště a odbavením – a mnohem levnější. ATLAS to ukáže sám, jen v Evropě a jen tam, kde to dává smysl:

- **Výsledky letů** – u cílů v dosahu čip *🚆 i vlakem/busem ~4 h 20 · od ~299 Kč* (odhad). U hledání ke konkrétnímu
  blízkému cíli nahoře srovnání **letadlo × vlak/bus** (cena na osobu, čas od dveří ke dveřím) a tlačítko *Ukázat spoje*:
  skutečné spoje RegioJetu na zvolený den (čas, délka, přestupy, vlak/bus, cena od–do, volná místa), na vyžádání i zpět,
  a odkazy na RegioJet, FlixBus, IDOS a Google Mapy. Když se let nenajde nebo je jich málo, nabídne vlak/bus i chytrá
  nápověda.
- **Průvodce cestou** – v kroku ✈️ Let u blízkého cíle volba *🚆 Pojedu vlakem / busem*: dny tam a zpět, výběr
  konkrétního spoje RegioJetu (nebo ponechat odhad). Vlak/bus pak nahradí let v termínech pobytu, v trase přes víc míst,
  v ceně ve Shrnutí, v plánovači, ve sdíleném odkazu i v kalendáři (.ics) – a jedním kliknutím jde vrátit zpět k letu.

**Kde to dává smysl:** obě místa na pevnině Evropy (ne Velká Británie, Irsko, Island, Malta, Kypr ani ostrovy jako
Mallorca, Kanáry, Korsika, Sardinie, Sicílie, Kréta) a nejvýš ~1 100 km vzdušnou čarou (do Švédska a Norska po souši přes Øresundský most – Stockholm ani Oslo už ne). **Zvýrazní se**, když platí
jednoduché pravidlo: cesta po zemi (+30 min na nádraží) je nejvýš o 1,5 h delší než letadlo od dveří ke dveřím
(cesta na letiště + 2 h před odletem + nejkratší nalezený let + 45 min po přistání + cesta do města), **nebo** trvá do 6,5 h, **nebo** je
aspoň o polovinu levnější a do 10 h. Důvod se u srovnání vždy napíše česky.

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
| `PORT` | `8080` | port serveru |
| `MAX_ORIGINS` | `8` | kolik nejbližších letišť se v jednom hledání prohledá |
| `WIZZ_MAX_CALLS` | `60` | Wizz Air nemá „kamkoliv“ – kolik dotazů na trasy smí jedno hledání udělat |
| `RYANAIR_ENABLED` / `WIZZ_ENABLED` | `1` | `0` = zdroj vypnout |
| `SEARCH_RATE_LIMIT` | `40` | max. hledání z jedné IP za 10 minut (ochrana při veřejném nasazení, `0` = bez limitu); počítají se do něj i dotazy na živé spoje RegioJetu (jen ty, které opravdu jdou na RegioJet – odpověď z mezipaměti ne) |
| `REGIOJET_LIVE` | `1` | `0` = vypnout živé spoje RegioJetu (vlak/bus místo letadla zůstane jako odhad a odkazy) |
| `REGIOJET_MAX_PER_HOUR` | `60` | nejvýš tolik dotazů na RegioJet za hodinu (pak jen odhad) |
| `REGIOJET_GAP_MS` | `1000` | nejmenší odstup dotazů na RegioJet (ms) |
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
- **Doprava na letiště** je odhad: silniční vzdálenost ≈ 1,25 × vzdušná, 80 km/h + 30 min, cena = km × sazba.

### API

| Endpoint | |
|---|---|
| `GET /api/health` | stav zdrojů, kurzy |
| `GET /api/places?q=vid` | našeptávač (`ap:VIE`, `metro:LON`, `cc:CZ`, `rg:kanary`, `geo:lat,lon\|Název`) |
| `GET /api/origins?from=ap:BRQ&radius=200` | letiště, která se prohledají, se vzdáleností a odhadem dopravy |
| `POST /api/search` | hledání, viz `normalizeQuery` v `server/lib/search.js`; odpověď je NDJSON (průběh, pak výsledek) |
| `GET /api/verify?from=BGY&to=BCN&out=2026-11-10&back=2026-11-14&adults=2` | živá cena a alternativy z Kiwi.com |
| `GET /api/stays?city=Milán&iata=BGY&checkin=…&checkout=…&adults=2` | ubytování seřazené podle poměru cena/hodnocení + odkazy na partnery |
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

Přesná data: místo `dateFrom`/`dateTo` + nocí pošli `"exactOut": "2026-11-14", "exactBack": "2026-11-21"` (a volitelně
`"flexDays": 1` = každé datum ±1 den); u `"trip": "oneway"` stačí `exactOut`. U přesných dat se na den a trasu nechají
všechny přímé lety (+ lety s přestupem, nejvýš ~12 variant), Kiwi se ptá se seznamy letišť a zvlášť jen na přímé lety.
Odpověď navíc má `nearby` (konkrétní cíl: nejlevnější známá cena po dnech ±3 kolem odletu/návratu z už stažených dat,
`lowcostOnDay` / `lowcostNear` a česká nápověda `hint`, když v zadaný den Ryanair/Wizz nemá volný let – nelétá, nebo je
vyprodáno), lety Ryanairu a Wizz Air mají `otherDeps` (další odlety téhož dne bez ceny, Ryanair z letového řádu `timtbl`).
Ceny v `nearby` jsou vč. dopravy na domácí letiště (u návratu na letiště příletu). `hubs` = přestupní letiště, ze kterých
se u dálkových cílů hledalo navíc (i když z nich nic nevyšlo – UI je pak v nápovědě znovu nenabízí). Lety v `top`/`groups`
mají u přesných dat ke konkrétnímu cíli `groundCzk` a `bagCzk` (doprava na domácí letiště a zavazadla k tomu letu, Kč/os.)
– pohled ✈︎ Lety z nich spočítá i dvojici samostatných letenek, která mezi kombinacemi není. Návrat se s letem tam
nepáruje, když odlétá dřív než 2 h po jeho příletu.

Čas a přestupy: lety s přestupem z Kiwi.com mají `layovers` – `[{ "at": "MUC", "min": 95 }]`, čekání na každém přestupu v minutách spočítané z místních časů úseků (když čas některého úseku chybí, pole chybí). Let bez známého času příletu (Wizz Air) má vedle `arrEst: true` i `estMin` – odhad délky letu v minutách (vzdálenost / 780 km/h + 35 min), který UI používá jen pro filtr délky cesty; `durationMin` zůstává `null`. Filtry času a přestupů běží v prohlížeči (`public/js/searchhelp.js`), server se kvůli nim znovu neptá.

Je to dobrá cena: každá skupina má `priceStats` (`n`, `min`, `p25`, `median`, `p75`, `max`, `dateFrom`, `dateTo`, `mins`), u konkrétního cíle i `priceStats` celé trasy; každá nabídka má `priceLevel` (`level` `low` / `normal` / `high`, `basis`, `reason`, `ref`, `vsRef`, `pos`, `n`).

Cesta přes víc měst: `"trip": "multi", "legs": [{ "from": ["ap:PRG"], "to": ["metro:ROM"], "date": "2026-11-03" }, { "from": ["ap:NAP"], "to": ["ap:PRG"], "date": "2026-11-08", "flexDays": 1 }]` – 2 až 4 lety jedním směrem, data po sobě (týž den smí), nejvýš 90 dní. Cílem (a místem odletu dalších letů) musí být město nebo letiště, ne země. `radiusKm`, `kmRate`, `exclude` platí pro odlet 1. letu; když je cíl posledního letu stejný jako odkud 1. letu, letí se na kterékoliv letiště začátku cesty (s `openJaw: false` jen na letiště samotného místa) a doprava z něj domů se přičte. Úseky se hledají nejvýš po dvou najednou s rozpočtem 24 dvojic letišť na zdroj. Průběh má navíc `legs: [{ label, state }]`. Odpověď má `mode: "multi"`, `legs: [{ label, from, to, date, flex, dest, options, count, nearby }]` (options = nejvýš 16 jednosměrných letů s `perPersonCzk` vč. dopravy a zavazadel), `links[i][a][b]` (`null` = let b úseku i+1 se po letu a stihne, jinak `{ why: "early" | "short" | "nextday", gapMin?, needMin?, move? }`), `combos: [{ picks, perPersonCzk, totalCzk, flightCzk, groundCzk, bagCzk }]` (30 nejlevnějších navazujících cest), `returnsHome` a `stats.feasible`. `maxPrice` platí na celou cestu.

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

## Omezení (upřímně)

- Ryanair a Wizz Air nemají veřejné API pro vývojáře; ATLAS používá stejná rozhraní jako jejich weby. Když je změní,
  je potřeba upravit adaptér (testy v `test/providers.test.js` popisují očekávaný tvar odpovědí).
- Ceny jsou základní tarif bez příplatků. Kabinový nebo odbavený kufr umí ATLAS přičíst (🧳 Zavazadla v „Další možnosti“),
  ale jen jako odhad podle dopravce (`server/lib/baggage.js`, stav 10/2026) – přesnou cenu ukáže až rezervace.
- Kombinace dvou aerolinek / různých letišť jsou **dvě samostatné letenky** – při zpoždění prvního letu druhá aerolinka
  nečeká. Aplikace to u výsledku označí.
- Odhad dopravy na letiště je orientační.
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
- Vlak a bus: seznam měst a zastávek RegioJetu (`brn-ybus-pubapi.sa.cz/restapi/consts/locations`), UUID měst FlixBusu
  (jen pro odkazy), změřené spoje z Prahy z průzkumu `research/ground.md` (větev `pc-research`); sestavuje `node scripts/build-ground.mjs` do
  `data/ground.json` (zdroj a datum jsou v souboru).
- Podnebí: [NASA POWER](https://power.larc.nasa.gov/) Climatology API (MERRA-2, 2001–2020), sestavuje
  `node scripts/build-climate.mjs` do `data/climate.json`.
- Země: cenová hladina podle Světové banky (PPP / směnný kurz, upravená na turistické ceny), bezpečnost podle MZV ČR,
  FCDO a US State Dept. Vstupní podmínky (`data/entry.json`): MZV ČR, oficiální weby e-víz a registrací, WHO a CDC.
- Vlajky na Windows: písmo Twemoji Country Flags (Twemoji, CC BY 4.0; detekce z country-flag-emoji-polyfill, MIT),
  přibaleno v `public/vendor/flags/`.
- Mapa světa: d3, topojson-client, world-atlas (ISC, přibaleno v `public/vendor/`).
- Mapy míst: MapLibre GL JS (BSD-3-Clause, přibaleno v `public/vendor/maplibre/`), podklad OpenFreeMap
  (© OpenMapTiles, data © přispěvatelé OpenStreetMap, ODbL), záloha dlaždice OpenStreetMap.
- Trasy na kole: [BRouter](https://brouter.de/) (veřejný server, bez klíče; jiný server přes `BROUTER_URL`),
  data © přispěvatelé OpenStreetMap. Odkazy do [Mapy.com](https://mapy.com/) přes jejich veřejné URL API (bez klíče).
- Původní jednosouborová verze aplikace je pro srovnání v `legacy/ATLAS-puvodni.html`.
