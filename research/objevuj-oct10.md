# ATLAS – průzkum sekce Objevuj (10. 10. 2026)

Živý web https://atlas-letenky.onrender.com, skutečný Chrome, čistý stav. Telefon 390×844: Barcelona (všechny režimy) a Lisabon (program, výlety). Počítač 1300×900: Praha (všechny režimy). Žádné hledání letů. Nic se neinstalovalo, kód se neměnil. Skripty, záznamy a všechny snímky: `%TEMP%\atlas-qa\obj\` na Peterově počítači; snímky k nálezům jsou v `research/objevuj-oct10/`.

Neprošel jsem: Lisabon na počítači (skončil na limitu požadavků, viz nález 1), tlačítko „📍 Tady“ (poloha), tisk a světlý režim.

## Měřené časy

| Co | Barcelona (telefon) | Lisabon (telefon) | Praha (počítač) |
|---|---|---|---|
| Našeptávač po dopsání názvu | 0,3 s | – | – |
| Seznam míst, první načtení | 29,6 s | 23,3 s | 22,1 s |
| Seznam míst, stejné místo podruhé | 0,04 s | – | 0,05 s |
| Změna okruhu na 20 km | 39,5 s | – | 10,5 s |
| Program ve městě | hned (0,06 s) | 44,8 s | hned (0,05 s) |
| Jednodenní výlety autem | 19,5 s | 42,5 s | 24,9 s |
| Výlety vlakem / vícedenní okruh (po výletech autem) | hned | – | hned |
| Na kole – okruh 40 km | 2,3 s | – | 0,6 s |
| Vlakem tam, na kole zpět | 28,6 s | – | 30,3 s |
| Pěšky – okruh 10 km | hned (0,3 s) | – | hned (0,3 s) |

## Nálezy podle závažnosti

### 1. Objevuj vyčerpá společný limit požadavků a zablokuje i hledání letů – vysoká
- **Kde:** celé Objevuj; server (`/api/poi`, `/api/itinerary`, `/api/roadtrip`, `/api/bike`, `/api/hike` volají stejný `rateLimited` jako `/api/search`).
- **Co:** Po průchodu Barcelonou a Lisabonem na telefonu a Prahou na počítači (zhruba 20 požadavků Objevuj za posledních 10 minut, hledání letů žádné) začal server vracet 429 „Příliš mnoho požadavků – zkus to za pár minut“. Proč to přišlo už po zhruba 20 a ne po 40, nevím – buď je na Renderu limit nastavený níž, nebo se počítá něco, co jsem neviděl. V tu chvíli by neprošlo ani hledání letů.
- **Jak to vypadá pro uživatele:**
  - Seznam míst: „⚠️ Místa se nepodařilo načíst: Příliš mnoho požadavků…“ a nic dalšího, žádné tlačítko Zkusit znovu.
  - Na kole: prázdný výsledek, chyba jen v hlášce, která za pár sekund zmizí.
  - „Jiná trasa“ / „Jiné nádraží“: zůstane stará trasa, takže to vypadá, že tlačítko nic nedělá.
- **Návrh:** Objevuj dát vlastní limit oddělený od hledání letů. Odpovědi z mezipaměti do limitu nepočítat (stejné místo podruhé se vrací za 40 ms, takže server nic nestojí). Chybu ukázat přímo ve výsledku s tlačítkem „Zkusit znovu“.
- **Snímek:** `objevuj-oct10/d-Lisabon-04-mapa.png`

### 2. Všechno první trvá 20–45 s a je vidět jen jeden řádek textu – vysoká
- **Kde:** seznam míst, program ve městě (Lisabon), výlety, vlakem tam.
- **Co:** Časy viz tabulka. Během čekání je vidět jen „Hledám zajímavá místa kolem: Barcelona…“ nebo text na tlačítku („Hledám cíle výletů…“, „Hledám nádraží a trasu…“). Žádný odhad, jak dlouho to potrvá, žádný průběh. Na telefonu je navíc tlačítko po kliknutí mimo obrazovku, když uživatel sjede níž.
- **Návrh:** Napsat rovnou odhad („obvykle 20–30 s“), jako to teď dělá radar. Seznam míst ukazovat postupně: nejdřív názvy a vzdálenosti, popisy a fotky doplnit. Naposledy otevřená místa si pamatovat v prohlížeči (stejně jako radar) a ukázat je hned.

### 3. U výletů je pokaždé „Část popisů se nenačetla – zkus to za chvíli znovu“ – střední
- **Kde:** Jednodenní výlety a Vícedenní okruh, všechna tři města, autem i vlakem.
- **Co:** Hláška byla nahoře u každého plánu výletů. Není u ní tlačítko a „zkusit znovu“ znamená čekat dalších 20–40 s. Když je tam vždy, nic neříká.
- **Návrh:** Chybějící popisy dotáhnout na pozadí bez nového plánování, nebo hlášku nahradit drobnou poznámkou u konkrétního místa bez popisu.
- **Snímek:** `objevuj-oct10/m-Barcelona-11-day.png`

### 4. Na telefonu je mapa až pod celým seznamem a klik na místo tam uživatele odnese – střední
- **Kde:** Objevuj, telefon.
- **Co:** Stránka Barcelony má 12 600 px, seznam začíná 1 140 px od vrchu a mapa je 12 100 px od vrchu, pod 66 kartami. Klik na kartu místa odroluje o 11 800 px dolů na mapu a zpět se uživatel musí doscrollovat ručně. U programu a výletů je mapa podobně až pod plánem i na počítači (2 700 px od vrchu), takže trasu a mapu nejde vidět zároveň.
- **Návrh:** Na telefonu mapu dát nad seznam (sbalitelnou) nebo přidat přepínač Seznam / Mapa. Po kliku na místo ukázat v mapě tlačítko „↑ zpět na seznam“. Na počítači mapu přilepit vedle plánu.
- **Snímek:** `objevuj-oct10/m-Barcelona-05-klik-na-misto.png`

### 5. Angličtina v názvech a popisech – střední
- **Kde:** seznam míst, „Uvidíš“ u výletů, nádraží u „Vlakem tam“.
- **Co:**
  - Anglický popis má 18 z prvních 40 míst v Barceloně a 14 ze 40 v Lisabonu (Museu Picasso, La Boqueria, Tibidabo, Rossio…). Praha je celá česky.
  - Anglické názvy: Magic Fountain of Montjuïc, Royal Square, Columbus Monument, Montjuïc Castle, Basilica of Our Lady of the Pine Tree, Rossio Square, Ribeira Palace, Ancient Roman theatre.
  - „Uvidíš: Roman circus of Tárraco, Archaeological Ensemble of Tárraco“, „Cultural Landscape of Sintra“, „Annaberg-Frohnau Mining Landscape“.
  - Nádraží: „Granollers Centre railway station“, „Sant Sadurní d'Anoia station“.
- **Návrh:** Když chybí český název, vzít místní (Font Màgica, Plaça Reial, Castell de Montjuïc) místo anglického – místní názvy jsou na cedulích. U anglického popisu ukázat krátký popisek z Wikidat v češtině, pokud existuje, a jinak popis zkrátit na jednu větu se štítkem „anglicky“.
- **Snímek:** `objevuj-oct10/m-Barcelona-11-train.png`

### 6. Výlety a okruhy vybírají nevýrazná místa – střední
- **Kde:** Jednodenní výlety, Vícedenní okruh.
- **Co:**
  - Barcelona, výlet 2: Monistrol de Montserrat a La Llacuna – obec pod klášterem a malá vesnice, ne klášter Montserrat.
  - Barcelona, okruh den 1: Malgrat de Mar a Lloret de Mar (plážová letoviska v říjnu), den 2 Avinyonet de Puigventós.
  - Praha, okruh den 2: Annaberg-Buchholz, Olbernhau, Freiberg – tři hornická města za sebou, všechna se štítkem „část památky UNESCO“. Stejně výlet 1: Drážďany + Altenberg.
  - Vypadá to, že štítek „část památky UNESCO“ a typ „Město / obec“ váží víc než známost místa.
- **Návrh:** „Část památky UNESCO“ bodovat výrazně méně než celou památku. Obce brát jen od určité známosti (počet jazyků článku na Wikipedii je k dispozici zdarma) a u cíle typu Montserrat cílit na památku, ne na nejbližší obec. Do jednoho dne nedávat tři místa stejného druhu.
- **Snímek:** `objevuj-oct10/d-Praha-11-loop.png`

### 7. Okruh hledání nic viditelně nemění a každá změna stojí desítky sekund – střední
- **Kde:** výběr Okruh (3 / 5 / 10 / 20 km).
- **Co:** Barcelona 10 km → 20 km: 39,5 s čekání a výsledek je stejných 66 míst ve stejném pořadí. Praha 5 → 20 km: 52 → 59 míst, začátek seznamu stejný. Uživatel neví, co okruh ovlivňuje.
- **Návrh:** Místa řadit nebo aspoň filtrovat podle vzdálenosti v prohlížeči nad už načtenými daty (okamžitě) a nový dotaz posílat jen při zvětšení nad to, co je načteno. V nadpisu psát „66 míst do 10 km“.
- **Snímek:** `objevuj-oct10/m-Barcelona-02-nahore.png`

### 8. Okruh na kole 40 km vyšel na 25,6 km – nízká až střední
- **Kde:** Na kole → Okruh, Barcelona.
- **Co:** Zadáno 40 km, vyšlo 25,6 km, „Jiná trasa“ dala 30,7 km. Hláška to přizná („v okolí se přesněji naplánovat nedala“), ale u města u moře, kde polovina kruhu padne do vody, to bude pravidlo. V Praze vyšlo 38,6 a 42,8 km, tam je to v pořádku.
- **Návrh:** Když trasa vyjde o víc než 20 % kratší, zkusit ji sám znovu s posunutým středem kruhu směrem od moře, než ji ukáže.
- **Snímek:** `objevuj-oct10/m-Barcelona-11-bike.png`

### 9. Procenta povrchu u trasy nedávají součet – nízká
- **Kde:** Na kole, Vlakem tam.
- **Co:** „35 % nezpevněné cesty · 81 % cyklostezky a cyklotrasy“ (Barcelona) nebo „4 % nezpevněné · 68 % cyklostezky · 24 % rušnější silnice“ (Praha). Čísla se překrývají a není jasné, co je zbytek.
- **Návrh:** Buď jeden pruh rozdělený na díly do 100 %, nebo slovně: „většinou po cyklostezkách, třetina po nezpevněném, čtvrtina po rušnější silnici“.

### 10. Každé uložení vytvoří v plánovači další cestu – nízká
- **Kde:** 💾 Uložit do plánovače.
- **Co:** Program, výlety, okruh a kolo z jedné Barcelony = čtyři cesty („Výlet: Barcelona“, „Výlety z: Barcelona“, „Okruh z: Barcelona“, „Na kole z: Barcelona – 30.7 km“) se stejnými daty. Samo ukládání funguje: dny, aktivity s časy příjezdu, u kola odkazy na Mapy.com a Google Maps v poznámkách.
- **Návrh:** Když už cesta do stejného místa se stejným termínem existuje, nabídnout „Přidat k cestě Barcelona“ místo nové.

### 11. Drobnosti – nízká
- Po uložení skočí aplikace do Plánovače bez možnosti zůstat v Objevuj.
- Kategorie míst: Prašná brána a zámek Troja jako „Hrad / pevnost“, Staroměstská radnice jako „Muzeum“, Palác svatého Benedikta (parlament) s ikonou kostela, „parc de la Ciutadella“ a „plaça del Rei“ s malým písmenem.
- Praha má mezi prvními 40 místy Sex Machines Museum, Barcelona Hash Marihuana & Hemp Museum – řazení podle blízkosti ke středu je vynáší nahoru.
- Na telefonu zabere 16 štítků kategorií 5 řádků a přepínač režimů 4 řádky; seznam míst začíná až na druhé obrazovce.
- Výlet vlakem: „~2 h 10 min vlakem / busem (odhad)“ do Tarragony, vlak jede asi hodinu. Odhad je hrubý, odkaz „spoje ↗“ vede správně do Google Maps.
- Vlakem tam při 40 km: Barcelona vyšla na 30,7 km, Praha na 48,5 km (Králův Dvůr).

## Co funguje dobře

- **Žádná chyba stránky ani konzole** (kromě 429 z nálezu 1) a žádné přetečení do šířky na 390 ani 1300 px.
- **Místa jsou věcně správně:** Barcelona 66, Lisabon 68, Praha 52 míst, všechna s fotkou (žádná se nenačetla špatně), popis chybí jen u jednoho místa na město. Vzdálenosti sedí, štítky UNESCO a „doporučuje Wikivoyage“ pomáhají.
- **Mapa** se vždy načetla, značek je tolik co míst, v programu jsou očíslované, klik na místo ukáže bublinu s odkazem.
- **Program ve městě** dává smysl: dny po čtvrtích, pěší vzdálenosti mezi body, „MHD/taxi“ u delšího přesunu, součet času a kilometrů.
- **Počasí** je u každého dne a v Praze samo poradilo: „V neděli hrozí déšť (28 %) – lepší by byl pátek 16. 10.“
- **Odkazy:** Google Maps s trasou celého dne, u výletů vlakem odkaz na spoje, u Prahy IDOS, Mapy.com a Google Maps u tras, Wikipedie u míst. Formát všech odkazů je správný; cílové stránky jsem neotevíral.
- **GPX** se stáhne se smysluplným názvem (`atlas-kolo-praha-38.6km.gpx`, 1 563 bodů).
- **Pěší okruh a okruh na kole jsou rychlé** (do 2,5 s) a mají výškový profil.
- **Vlakem tam, na kole zpět** funguje: nádraží, odkaz na spojení, trasa zpět, upozornění na jízdenku pro kolo.
- **Uložení do plánovače** přenese dny, aktivity i poznámky; po návratu do Objevuj plán zůstane.
- **Druhé načtení téhož místa je okamžité** (mezipaměť na serveru).

## Nápady, které nic nestojí a nepotřebují údržbu

1. **Pamatovat si naposledy otevřená místa v prohlížeči** a nabídnout je jako štítky pod hledáním („Naposledy: Barcelona · Lisabon · Praha“). Druhé otevření je ze serverové mezipaměti hned.
2. **Propojit s hledáním letů:** u místa tlačítko „✈️ Najít lety sem“ a naopak z výsledku letu „🗺️ Co tam dělat“ s už vyplněným městem a daty pobytu.
3. **Předvyplnit Objevuj z cesty v průvodci nebo plánovači:** místo, datum začátku a počet dní vzít z rozplánované cesty, ne vždy „zítra, 3 dny“.
4. **„Co stihnu za odpoledne“:** jedno tlačítko, které z už načtených míst vybere 4–5 nejbližších nejznámějších. Počítá se v prohlížeči, žádný nový dotaz.
5. **Řazení seznamu v prohlížeči:** podle vzdálenosti / známosti / kategorie nad načtenými daty, bez nového dotazu.
6. **Počítadlo u „+ chci vidět“** („vybráno 7 míst → Sestavit program jen z nich“). Volba už existuje, jen není vidět, kolik je vybráno.
7. **Odkaz na Mapy.com i u míst a u denního programu**, nejen u tras – pro pěší trasy v Česku jsou lepší než Google Maps.
8. **Otevírací doba a web z OpenStreetMap** u míst, kde je v datech (`opening_hours`, `website`) – bez klíče, stejný zdroj, nad kterým už běží mapa a trasy.
9. **U výletů štítek „v říjnu mimo sezónu“** podle měsíce a typu místa (pláže, lázně, horské cíle) z podnebí, které už aplikace má.
10. **Sdílení odkazem** jako u cesty a plánu: `#explore=Barcelona&mode=day` otevře totéž místo a režim. Data se načtou znovu ze serveru, do odkazu se nic velkého neukládá.
