# ATLAS – QA 6. kolo (živý web, `main` a014d9f)

- **Kdy:** 6. 10. 2026, 10:30–11:00 SELČ
- **Kde:** https://atlas-letenky.onrender.com (bez studeného startu, načtení ~4 s)
- **Čím:** Google Chrome (stabilní kanál) na Windows 11, řízený přes playwright-core, jazyk cs-CZ, výchozí 2 osoby
- **Rozlišení:** 1300×900 a 390×844 – každé prošlo všech 8 bodů zadání; body 1–3, 5 a 7 jsem na 1300×900 pustil dvakrát (druhý běh s rozšířenou kontrolou filtru a výběru po krocích)
- **Kód v repozitáři jsem neměnil.** Skripty a snímky jsou jen lokálně v `%TEMP%\atlas-qa` (`round6.js`, složka `round6\`, 71 snímků + 5 souborů .ics + 3× JSON s výsledky).

## Shrnutí

Všech 8 bodů funguje na obou rozlišeních. **0× pageerror, 0× chyba v konzoli, 0× HTTP ≥ 400, žádné vodorovné přetečení** (ani na 390 px). Našel jsem **1 skutečnou chybu** (filtr „Jen přímé" skryje úplně všechno, i když přímé lety ve výsledcích jsou), **2 věci, které uživatele zavádějí** (banner letadlo × vlak míchá cenu jednoho letu s časem jiného; lety „z cache" s přestupem mají nemožnou délku a čas příletu) a pár drobností.

| # | Bod zadání | 1300×900 | 390×844 |
|---|---|---|---|
| 1 | Praha→Vídeň: banner letadlo × vlak/bus, „Ukázat spoje", odkazy RegioJet/FlixBus/IDOS | ✅ (viz P2) | ✅ |
| 2 | Filtr „🕐 Čas a přestupy" | ⚠️ ráno ✅, čipy a ✕ ✅, **„Jen přímé" ❌ (B1)** | ⚠️ totéž |
| 3 | „Je to dobrá cena?" – štítek + panel | ✅ | ✅ |
| 4 | Praha→kamkoliv: čip 🚆, „🛂 ETA" u Londýna, nic nepřetéká | ✅ | ✅ |
| 5 | „🗺️ Víc měst" Praha→Barcelona, Lisabon→Praha | ✅ (viz P3) | ✅ |
| 6 | Země: karta USA s ESTA, detail USA/Thajsko/Albánie, filtr „Vstup" | ✅ | ✅ |
| 7 | Průvodce cestou: vlak místo letu + .ics; Londýn „🛂 Před cestou" + poplatek | ✅ | ✅ |
| 8 | Vlajky jako obrázky | ✅ | ✅ |

## Chyby a postřehy

### B1 – Filtr „Jen přímé" skryje všech 63 nabídek, i když přímé lety existují (střední až vyšší závažnost)

**Postup:** Lety → Odkud Praha, Kam Vídeň → Přesná data 20. 10. – 23. 10. 2026 → Hledat → „🕐 Čas a přestupy" → Přestupy: **Jen přímé**.

**Co se stane:** zmizí oba sloupce „Tam"/„Zpět" i vybraná cesta, zůstane „Filtrům nic neodpovídá." a rámeček „Filtry času a přestupů skryly 63 nabídek"; v panelu „skryto 63 z 63 nabídek", čip „bez přestupu · skryto 63 ✕". Stejně na 390 px.

**Co má být:** bez filtru je ve výsledcích 3× přímý Austrian tam (07:30, 11:15, 16:50, 50 min) a 3× přímý zpět (09:45, 15:20, 21:00). Ručně je složit jde: kliknu na OS 11:15 a OS 09:45 → „Vybraná cesta" OS 644 + OS 643, 11 994 Kč/os. Filtr má tedy nechat 3 + 3 přímé lety a nabídnout jejich nejlevnější dvojici. Uživatel teď dostane mylnou informaci, že Praha–Vídeň přímo nelétá.

**Příčina:** `SearchHelp.fillLegs()` (`public/js/searchhelp.js`, zhruba ř. 225–255). Let, který filtru vyhoví, skládá jen s lety druhého směru z kombinací, které prošly **všemi** filtry (`vis`). U filtrů, které platí pro oba směry (přestupy, přílet nejpozději, max. délka, nejdelší přestup), ale žádná kombinace ze serveru projít nemusí – server posílá nejlevnější dvojice (Ryanair s přestupem + Austrian) – takže `vis` je prázdné, partner se nenajde a nesloží se nic.

**Návrh opravy:** když partner ve `vis` není, brát partnery z `pre` – lety druhého směru, které samy vyhoví filtrům svého směru (`timeFails({ back: l })`, resp. `{ out: l }`), od nejlevnějšího – a složit je přes `composeTrip`. Test: PRG→VIE s „Jen přímé" má dát 3 lety tam, 3 zpět a vybranou dvojici přímých letů.

Filtr „Odlet tam: Ráno" (platí jen pro jeden směr) funguje správně – viz bod 2.

### P2 – Banner letadlo × vlak spojuje cenu jednoho letu s časem jiného (střední)

**Postup:** stejné hledání Praha→Vídeň 20.–23. 10., banner nad výsledky.

**Co je vidět:** „✈️ Letadlo od **4 045 Kč** na osobu, tam i zpět · **~5 h** od dveří ke dveřím (nejrychlejší nalezený let)".

**Proč to mate:** za 4 045 Kč je Ryanair s přestupem v Krakově – 14 h 20 min tam a 18 h 55 min zpět. Těch ~5 h platí pro přímý Austrian, který v ATLASu stojí 11 994 Kč/os. (nejlevnější kombinace s přímým letem aspoň jedním směrem je 5 757 Kč). Podle Google Flights stojí přímá zpáteční letenka Austrian na tyhle dny 421 € ≈ 10 300 Kč/os. Uživatel si z banneru odnese „letadlem za 4 tisíce za 5 hodin", což koupit nejde. Vlak (RegioJet 299 + 399 Kč, 4 h 20) je tu přitom jasně lepší.

**Návrh:** vzít cenu i čas z jednoho letu – buď u ceny „od" ukázat čas právě toho letu („od 4 045 Kč · 14 h 20, 1× přestup"), nebo ukázat dvojici „nejlevnější 4 045 Kč (14 h+) · nejrychlejší ~5 h od 11 994 Kč".

Pozn.: přímý zpáteční let ATLAS skládá ze dvou jednosměrných letenek (7 545 + 4 329 = 11 874 Kč), skutečná zpáteční letenka je asi o 13 % levnější (10 300 Kč). Jednosměrná cena sedí zhruba (Google 291 € ≈ 7 120 Kč vs. 7 545 Kč).

### P3 – Lety „z cache" s přestupem mají nemožnou délku a čas příletu (nižší až střední)

**Postup:** Lety → „🗺️ Víc měst" → 1. let Praha → Barcelona 30. 10., 2. let Lisabon → Praha 4. 11. → Hledat.

**Co je vidět:** nejlevnější v obou krocích jsou lety ze zdroje „Ostatní aerolinky" (oranžový odznak, cache Aviasales):
- `U2 20:30 → 23:35 PRG→BCN · 3 h 05 min · 1× přestup · easyJet · 1 173 Kč` – přímý let trvá 2 h 30 (Vueling o řádek níž), s přestupem se to za 3 h 05 stihnout nedá;
- `FR 06:00 → 11:15 LIS→PRG · 4 h 15 min · 1× přestup · Ryanair · 2 851 Kč` – přímý TAP letí 3 h 35; Ryanair tu trasu nelétá (živý zdroj Ryanair to ve stejném hledání sám hlásí: „2. let: tuto trasu nelétá").

Z těchhle dvou letů je složená „Nejlevnější celá cesta" 4 024 Kč/os. Na rozdíl od letů z Kiwi u nich chybí letiště a délka přestupu a v řádku není štítek „z cache" (jen barva odznaku).

**Pravděpodobná příčina (neověřeno na datech API):** `server/providers/travelpayouts.js` ř. 42 a 50 bere `durationMin: d.duration_to || …` spolu se `stops: d.transfers`. U letů s přestupem to vypadá na čistý letový čas bez čekání, takže dopočtený přílet vychází dřív, než je možné. Může být špatně i počet přestupů – jedno z těch dvou polí nesedí.

**Návrh:** u letů z cache se `stops > 0` nebrat délku a přílet jako známé (`durationMin: null` → „přílet neznámý", filtry je pak neskrývají a párování ve „Víc měst" by mělo počítat s větší rezervou), případně takový záznam zahodit, když je délka kratší než přímý let + ~45 min. A do řádků výběru letů přidat štítek „z cache – ověř".

### Drobnosti

- **D1 – text pro vývojáře v UI:** v průběhu hledání u Wizz Air stojí „prohledáno 15 z 22 tras (limit WIZZ_MAX_CALLS)". Název proměnné uživateli nic neřekne – stačí „prohledáno 15 z 22 tras".
- **D2 – karta „🛂 Před cestou" (Londýn):** řádek „🛂 Cestovní pas – občanský průkaz nestačí (po dobu pobytu)". Závorka je platnost pasu bez popisku a čte se divně; lepší „(platný po celou dobu pobytu)" nebo „platnost pasu: po dobu pobytu".
- **D3 – detail země na 390 px:** pole „Platnost pasu" je v polovině šířky, delší text (USA: „platný biometrický e-pas po dobu pobytu; OP ani cestovní průkaz nestačí") se láme na 4 řádky a pravá polovina je prázdná. Na mobilu by mělo jít přes celou šířku.
- **D4 – čip 🚆 i u dalekých cílů:** z 9 čipů jsou dva u cest přes 11 hodin (Benátky ~11 h 50, Kodaň ~11 h 10) a Gdaňsk ~9 h 25. Zvažte hranici (třeba do 8 h, nebo jen když je vlak levnější).
- **D5 – různé počty nabídek:** u Vídně říká panel ceny „celkem 88", filtr času „z 63 nabídek", Kiwi „66 nálezů". Asi různé základy, jen to vedle sebe působí nekonzistentně.
- **D6 – `net::ERR_ABORTED` u `POST /api/search`:** v prvním běhu 4× (po každém dokončeném hledání), v dalších dvou bězích ani jednou. Je to známý neškodný závod po skončení streamu, výsledky byly vždy kompletní.

## Co jsem ověřil – po bodech

### 1) Praha → Vídeň, přesná data 20.–23. 10. 2026
- Hledání 6–21 s. Ryanair a Wizz Air „tuto trasu nelétá", Kiwi 66 nálezů. Výsledek: výběr „Tam" 11 letů / „Zpět" 8 letů.
- Banner „🚆 Praha → Vídeň i vlakem nebo busem": „Vlakem/busem ~3 h 54 – rychleji než letadlem (letadlem ~5 h i s cestou na letiště a odbavením)", letadlo od 4 045 Kč, vlak/bus odhad od ~598 Kč tam i zpět.
- „Ukázat spoje" → do 2 s živý RegioJet: „10 spojů ke koupi · cena na osobu, jedním směrem", např. 🚆 06:01 → 10:21 · 4 h 20 · přímý · Praha hl.n. → Vídeň Hbf · 299 Kč až 499 Kč; 🚌 07:00 → 11:40 · 299–349 Kč; vyprodaný spoj je zešedlý s „vyprodáno". Funguje výběr data i „↩ Ukázat i spoje zpět (23. 10.)". Tlačítko se přepne na „Skrýt spoje".
- Odkazy jsem otevřel v novém panelu a zkontroloval obsah:
  - **RegioJet** (`regiojet.cz/?departureDate=2026-10-20&fromLocationId=10202003&toLocationId=10202052&…&tariffs=REGULAR&tariffs=REGULAR`) – načte spoje Praha → Vídeň na 20. 10. pro 2 cestující, první 06:01 → 10:21 za 598 Kč (= 2 × 299 Kč, sedí s ATLASem).
  - **FlixBus** (`shop.flixbus.cz/search?…&rideDate=20.10.2026&adult=2`) – „Autobusem z města Praha do města Vídeň, út, 20 říj", spoje s cenami.
  - **IDOS** (`idos.cz/vlakyautobusy/spojeni/?f=Praha&t=Wien&date=20.10.2026&time=7%3A00&submit=true`) – „Praha ➞ Wien; Rakousko", spojení od 7:00.
  - Google Mapy – trasa MHD Praha → Wien (bez data, to odkaz neumí).

### 2) Filtr „🕐 Čas a přestupy"
- Panel má 6 polí: Odlet tam, Odlet zpět, Přílet nejpozději, Přestupy, Max. délka cesty, Nejdelší přestup. Na 390 px se vejde celý.
- „Odlet tam: Ráno" → okamžitě, bez nového hledání: „skryto 23 z 63 nabídek", sloupec Tam 11 → 7 letů „· 4 skryto", všechny odlety 06:15–11:15 ✅, sloupec Zpět beze změny. Čip „🛫 odlet tam ráno · skryto 23 ✕", na tlačítku počet „1".
- Přidání „Jen přímé" → **B1** (vše skryto). ✕ na čipu „ráno" zruší jen ten jeden filtr ✅ (počet 2 → 1). „Zrušit filtry času" vrátí 11 / 8 letů ✅. Zavření panelu ✅.

### 3) „Je to dobrá cena?"
- Štítek u nabídky: „Běžná cena" (Vídeň), jinde „💚 Dobrá cena", „🔥 Super cena", u ručně složených přímých letů „🔺 Dráž než obvykle".
- Odkaz „Je to dobrá cena?" otevře panel: verdikt („Běžná cena – levná mezi nabídkami do tohoto cíle, ale nad průměrnou cenou na tuto vzdálenost"), 📊 škála 3 925–13 623 Kč (čtvrtina do 6 362 Kč, medián 7 331 Kč), 📏 průměr na 278 km ≈ 1 853 Kč/os. (tahle +112 %), 🧠 co ATLAS na trase viděl, 📅 do odletu 14 dní, 💡 „Co s tím?", tlačítko „♡ Hlídat cenu tohoto hledání". Na 390 px bez vodorovného posuvu.

### 4) Praha → kamkoliv (výchozí pružné hledání)
- 150 destinací za 28–35 s (Ryanair 17, Wizz Air 22, Ostatní 256, Kiwi 138–188; na desktopu Kiwi jednou „částečně … po 25 s").
- Čip „🚆 i vlakem/busem ~X h · tam i zpět od ~Y Kč · odhad" u 9 cílů: Krakov ~5 h 50 / ~558 Kč, Budapešť ~6 h 11 / ~798 Kč, Poprad ~6 h 40 / ~780 Kč, Gdaňsk ~9 h 25 / ~920 Kč, Kodaň, Benátky… Klik otevře okno se srovnáním a odkazy (Gdaňsk: „letadlo tu vychází lépe", „RegioJet mezi těmito městy nejezdí").
- Londýn: štítek **„🛂 ETA 23 €"** ✅. Jinde vidět i „🛂 ESTA 36 €", „🛂 eTA 27 €", „🛂 ETA-IL 7 €", „🛂 e-vízum 22 €/45 €", „🛂 vízum na hranici", u EU „🪪 stačí OP".
- 390 px: šířka dokumentu = 390, žádný prvek nepřesahuje pravý okraj; čip 🚆 se zalomí na dva řádky uvnitř karty.

### 5) „🗺️ Víc měst"
- Formulář: 1. let Praha (+200 km) → Barcelona (BCN, GRO, REU) 30. 10.; 2. let Lisabon → Praha 4. 11. Řádek „2 lety · 30.10. → 4.11. · lety se stejným letištěm páruju s rezervou aspoň 3 h, přejezd jinam nejdřív další den".
- Výsledek za 12–20 s: dva sloupce po 12 letech, „Nejlevnější celá cesta" 1 173 + 2 851 = **4 024 Kč/os.** (8 048 Kč za 2), „🏙️ Barcelona: 5 nocí · přejezd Barcelona → Lisabon (BCN → LIS) vlastní dopravou", pod tím 6 kombinací + „Další kombinace". Upozornění, že každý let je samostatná letenka ✅.
- Výběr po krocích: 2. nabídka v 1. kroku (FR PRG→GRO 2 420 Kč) → „Nejlevnější cesta s vybranými lety", 10 542 Kč za 2 ✅ (2 × (2 420 + 2 851)), text se přepíše na „přílet GRO, odlet LIS". Let ve 2. kroku (FR 10:05, 3 924 Kč) → „Vybraná cesta" 12 688 Kč ✅. Klik na nejlevnější kombinaci → výběr přeskočí na ni, 8 048 Kč ✅. „Zrušit výběr" → zpět „Nejlevnější celá cesta" ✅.
- Nezkoušel jsem: zešednutí nenavazujících letů (při 5denním odstupu navazuje všechno) a pokračování do průvodce z více měst.

### 6) Země
- 197 karet. USA má čip **„🛂 ESTA"** ✅ (Spojené království „🛂 ETA", Somálsko „🛂 e-vízum", SAE „bez víza", EU „🪪 stačí OP").
- Filtr „Vstup": vše 197 · „🪪 Stačí OP" 41 · „Bez víza a registrace" 115 ✅.
- Detail se sekcí „🛂 Vstup pro občany ČR" ✅:
  - **USA** – „Nutná online registrace předem: ESTA · ~36 € (≈ 880 Kč) na osobu · oficiální web ↗" (esta.cbp.dhs.gov), „Nutná i při přestupu", jen pas, 90 dní, povinné očkování žádné, zdroj MZV ČR (ověřeno 10/2026) + upozornění, že je to informativní přehled.
  - **Thajsko** – „Bez víza – jen s cestovním pasem", 30 dní, pas 6 měsíců po vstupu, TDAC.
  - **Albánie** – „🪪 Bez víza – stačí i občanský průkaz", 90 dní.

### 7) Průvodce cestou
- **Vídeň, vlak místo letu:** vybraný let → v kroku Let karta „🚆 Nebo vlakem / busem · Praha → Vídeň · ~3 h 54 · od ~299 Kč/os." → „🚆 Pojedu vlakem / busem" → data Tam 20. 10. / „i zpět vlakem / busem" / Zpět 23. 10., živé seznamy RegioJet oběma směry → vybráno 06:01 → 10:21 (299 Kč) a 06:39 → 10:56 (399 Kč) → „✓ Pojedu tímhle – místo letu". Karta „🚆 Cesta vlakem / busem … Vlak / bus celkem za 2 os.: 1 396 Kč" + možnost změnit / vrátit se k letu.
- Shrnutí: „🚆 Vlak / bus tam i zpět (2 os.) 1 396 Kč · Celkem 1 396 Kč · na osobu 698 Kč"; „Co zarezervovat": 1. Jízdenka tam (20.10. 06:01, RegioJet), 2. Jízdenka zpět; „🛂 Před cestou": Rakousko, stačí OP; „Průběh cesty" s oběma vlaky.
- **.ics obsahuje vlak ✅** – platný soubor, 2 události: „🚆 Praha → Vídeň · RegioJet (vlak)" `DTSTART:20261020T040100Z` – `DTEND:…082100Z` (= 06:01–10:21 SELČ) a „🚆 Vídeň → Praha · RegioJet (vlak)" `20261023T043900Z`–`085600Z`; v popisu místní časy, stanice a odkaz na RegioJet.
- **Londýn (27.–31. 10., všechna letiště):** u nabídky štítek „🛂 ETA 23 €"; vlak se v kroku Let nenabízí (správně). Shrnutí: řádek **„🛂 ETA (Velká Británie) · 2 × ~23 € – vstupní poplatek, orientačně · + 1 130 Kč"** a „Celkem i se vstupními poplatky 9 440 Kč" (8 310 + 1 130 ✅). Karta **„🛂 Před cestou"**: Spojené království · ETA · „Cestovní pas – občanský průkaz nestačí" · „Nutná online registrace předem: ETA (UK) · ~23 € (≈ 560 Kč) na osobu (2 os. ≈ 1 130 Kč) · oficiální web ↗ · nutná i při přestupu…" · „Pobyt nejvýš 180 dní" · zdroj.
- .ics pro Londýn: 3 události – dva lety a celodenní „🛂 Vyřídit ETA (Velká Británie)" 13. 10. (14 dní před odletem) s odkazem na gov.uk. Časy letů sedí i přes změnu času 25. 10. (PRG 17:55 SEČ = 16:55Z, LTN 07:35 GMT = 07:35Z).

### 8) Vlajky
- Vykreslují se jako barevné obrázky: ověřeno testem pixelů na plátně (🇵🇱 ve výsledcích, 🇦🇫 v Zemích) a na snímcích (🇬🇧 🇺🇸 🇦🇹 🇪🇸 🇵🇹 🇨🇿 🇭🇺 🇷🇴) – v kartách, výběru míst, detailu země i v průvodci.

## Technické kontroly

| | 1300×900 (1. běh) | 1300×900 (2. běh, body 1–3, 5, 7) | 390×844 |
|---|---|---|---|
| pageerror | 0 | 0 | 0 |
| chyby v konzoli | 0 | 0 | 0 |
| HTTP ≥ 400 | 0 | 0 | 0 |
| requestfailed | 4× `POST /api/search` ERR_ABORTED (D6) | 0 | 0 |
| vodorovné přetečení | ne | ne | ne |

Přetečení jsem kontroloval dvojím způsobem: šířka dokumentu proti oknu a hledání viditelných prvků za pravým okrajem (mimo vodorovně posuvné pásy). Jediný nález je dekorativní pozadí `.hero-aurora` na Přehledu, které je oříznuté a posuv nezpůsobuje.

## Co jsem nedělal

- Nezávislé ověření dat o vstupu (entry.json) je pořád odložené. Z dřívější kontroly zůstávají k ověření mimo jiné **ETA pro Velkou Británii „20 GBP / ~23 €"** a **Thajsko „od 15. 9. 2026 jen 30 dní"** – obojí je teď na webu vidět.
- Netestoval jsem nákupní odkazy letenek, hotely, auto a program v průvodci, světlý režim ani jiné prohlížeče.
