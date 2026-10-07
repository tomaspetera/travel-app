# Jízdné z letiště do města – kontrola oficiálních stránek ve skutečném Chromu (2)

- **Kdy:** 7. 10. 2026
- **Jak:** skutečný Chrome řízený přes playwright-core (viditelné okno, čistý profil). Stránky jsem otevíral, rozklikával a četl jejich text; PDF jsem stáhl a přečetl přes `pdftotext`. Nic jsem neinstaloval.
- **Cena** = dospělý, jedna cesta, z letiště do centra.
- Uložené texty stránek, snímky a skripty jsou na PC v `%TEMP%\atlas-qa\arrival2\`.

## Shrnutí

Z 38 položek (řádků tabulek níže):

- **16 potvrzeno** na oficiální stránce (z toho 3 jen zčásti – viz poznámky);
- **4 mají na oficiální stránce jinou hodnotu** než `arrival.json`: Korfu (1,30 € místo 1,10 €), Chania (2,20 € místo ~2,50 €), Skiathos (3,00 € nebo 2,20 €, ne 2 nebo 3 €) a Marseille (čas 30–50 min místo 25 min);
- **18 se potvrdit nepodařilo** – oficiální stránka cenu neukazuje, nenačte se, blokuje automatizovaný prohlížeč, nebo jsem ji nenašel. U těch uvádím, co říká sekundární zdroj z vyhledávače, a je to tak i označeno.

Nejdůležitější opravy pro `arrival.json`: **CFU 1,30 €**, **CHQ 2,20 €**, **JSI 3,00 €** (linka z letiště je „jízdenka 1“), **MRS čas 30–50 min**, **LGW ve špičce 19,20 £** (jen sekundární zdroj), doplnit **SBZ 3,5 lei** a **VAR 1,00 €**.

## A) Oficiální stránka, cena se ukáže až skriptem

| Letiště | Potvrzeno | Jízdné | Čas | URL | Citace / poznámka |
|---|---|---|---|---|---|
| **LPA** Gran Canaria | ✅ ano | 2,30 € (platba u řidiče) | 20 min | https://guaguasglobal.com/en/routes-timetables/touristic-information/airport/ | „Airport – Las Palmas de Gran Canaria (San Telmo) · Lines: 60 and 91 · Direct payment: 2.30€ · Travel time: 20 min.“ Na Santa Catalinu 2,95 € / 30 min. |
| **FUE** Fuerteventura | ❌ ne | na stránce jen 1,45 € za celý úsek | – | https://tiadhe.com/en/line-03/ | Stránka linky 03 uvádí jen „Precios / Prices: 1,45€ Puerto del Rosario a Caleta de Fuste“. Cena z letiště do Puerto del Rosario tam samostatně není; 1,40 € jsem nenašel. Stránka Aena ceny nemá, jen odkaz „Official timetable and fares on the Tiadhe website“. Karta BtF pro nerezidenty dává slevu 10 % (https://tiadhe.com/en/payment-systems/). |
| **FNC** Madeira | ✅ ano | předplacená 2,00 €, u řidiče 2,65 €; Aerobus 5,55 € | – | https://siga.madeira.gov.pt/public/index.php/tiim (stáhne PDF ceníku) | „Bilhete de Bordo / On board – Intermunicipal 2,65“, „Pré-Comprado (por viagem) / Prepaid – Intermunicipal 2,00“, „Pré-comprado Aerobus / Aerobus Prepaid 5,55“. Platí podle „Portaria n.º 128/2026, de 23 de março“. Karta GIRO stojí 0,50 €. Linku 702 jsem neověřoval. |
| **CFU** Korfu | ⚠️ jiná cena | **1,30 €** (zóna A, předprodej) | – | https://astikoktelkerkyras.gr/en/tickets/ | „A ZONE · Ticket Prices: 1.30€ Regular.“ a mezi cíli zóny A „Airport – San Rocco Square – Port.“ U řidiče: „On the bus, tickets are sold at a higher price according to the law.“ – částka tam uvedena není. Linka 15 potvrzena na https://astikoktelkerkyras.gr/en/connection-with-the-airport/. |

## B) Oficiální zdroj se z cloudu nenačte

| Letiště | Potvrzeno | Jízdné | Čas | URL | Citace / poznámka |
|---|---|---|---|---|---|
| **AYT** Antalya | ✅ ano | 42 TL s Antalyakart, 50 TL bankovní kartou | – | https://www.antalyakart.com.tr/Page/Faqs (otázka „Toplu taşıma araçlarına biniş ücretleri ne kadar?“) | „Tam Ücret: 42.00 TL … Kullan At Bilet (1 Biniş İçin): 46.00 TL · Kredi Kartı: 50.00 TL · Aktarma: Ücretsiz“. Jde o obecné jízdné MHD, tramvaj AntRay tam jmenovitě není. |
| **BJV** Bodrum | ❌ ne | – | – | https://www.havas.net/otobus-hizmetleri | Stránka v Chromu ukáže jen obrázek a dva odkazy, žádný ceník. Sledovač https://otobusumnerede.havas.net/ zná „BODRUM HAVALİMANI“ a „BODRUM ŞEHİR MERKEZİ“, ale bez ceny. 270 TL jsem nepotvrdil. |
| **DOH** Dauhá | ⚠️ zčásti | 2 QAR za jízdu, karta 10 QAR | – | https://www.metrotram.qa/media/pdf/pocket_map.pdf | PDF se stáhlo. V textu je „Standard Travel Card“, „Fare per Trip“, „Travel Card Cost“ a hodnoty 2, 6, 10, 30, 100 QAR, ale rozložení se při převodu rozsypalo, takže přiřazení čísel k řádkům čtu s výhradou. |
| **CUN** Cancún | ❌ ne | – | – | https://www.ado.com.mx/ | Úvodní stránka cenu neukáže bez vyhledání spoje, které se mi nepodařilo projít. Sekundární zdroje uvádějí 130–140 MXN a ~45 min. |
| **MRS** Marseille A1 | ⚠️ jiný čas | cena na stránce není | **30–50 min** | https://www.marseille.aeroport.fr/parkings-et-acces/acces/bus/marseille-gare-st-charles | „Durée du trajet : entre 30 et 50 minutes environ dans des conditions normales de circulation“; interval 10 min přes den. E-shop letiště uvádí „Durée moyenne 25min“, cenu ukáže až po výběru data. 15 € mám jen ze sekundárního zdroje (turistická kancelář Marseille: jednotlivá 15 €, zpáteční 26 €). |
| **MRS** L13 + TER | ❌ ne | – | bus 5 min + vlak | https://www.marseille.aeroport.fr/parkings-et-acces/acces/trains | Letiště potvrzuje spoj: „emprunter la ligne LeBus13 … (7j/7 - 57 A/R quotidiens)“, „Temps de trajet estimé : 5 minutes“, v týdnu každých 12 min. Cenu L13 ani TER stránka neuvádí. Sekundárně: L13 1,20 €, TER do St-Charles kolem 8 €, vlak ~15 min. |
| **RMI** Rimini | ✅ ano | 2,00 € (1 zóna, 60 min) | – | https://www.startromagna.it/biglietti/startap-sistema-emv/ | „1 zona 2,00 € 60 min“, při platbě kartou ve voze „Tariffe identiche all'acquisto presso le rivendite autorizzate“. Cenu 3 € u řidiče jsem na této stránce neviděl. |
| **GOA** Janov | ✅ ano | 2,20 € (AMT + Trenitalia, 110 min) | – | https://www.amt.genova.it/amt/biglietti-e-abbonamenti-2/biglietti-e-carnet/ | „Biglietto integrato AMT-Trenitalia da 110 minuti € 2,20“; obyčejná jízdenka 2,00 €. Airlink na stránce jmenovitě není. |
| **RVN** Rovaniemi | ✅ ano (léto) | 8,00 € | – | https://www.airportbus.fi/pages/timetables-summer | „Airport express one way ticket summer · Regular price €8,00 EUR“. **Zimní cena:** web teď prodává jen letní jízdenku, zimní stránku ani cenu jsem nenašel. FAQ: jezdí 09:00–21:30 každých 25 min. |
| **HEL** Helsinky | ✅ ano | 4,50 € (aplikace, karta, automat); 4,80 € bezkontaktně | 30 min | https://www.hsl.fi/en/tickets-and-fares/single-tickets/single-ticket-prices-in-the-hsl-area | „Zones ABC, BCD and CDE · €4.50 with the HSL app and HSL card, at sales and service points or from ticket machines · €4.80 with contactless payment“. Čas: https://www.hsl.fi/en/travelling/visitors/airport-train – „From Helsinki Airport to Helsinki city center by train in 30 minutes … An ABC ticket gets you from Helsinki Airport to Helsinki city center.“ |
| **LPL** Liverpool | ✅ ano | 2 £ | – | https://www.merseytravel.gov.uk/tickets-and-pricing/ticket-types/adult-single-fare/ | „Adult single bus fares have been capped at £2 for all bus services in the Liverpool City Region“. Linka 500 jmenovitě ne. |
| **EMA** East Midlands | ❌ ne | – | – | https://www.trentbarton.co.uk/fares-and-tickets/choosing-the-right-ticket | Stránky trentbarton jednotlivé jízdné neuvádějí, jen stropy (mango denní 8,10 £) a zigzag 9 £. 3 £ jsem nepotvrdil. |
| **LBA** Leeds Bradford | ⚠️ zčásti | strop 2,50 £ | – | https://www.westyorks-ca.gov.uk/transport/buses/bus-service-improvement-plan/ | „The Mayor's Fares – This scheme capped bus fares for single journeys across West Yorkshire at just £2.50“. Web Transdev (Flyer A1) vrací automatizovanému Chromu 403 „Just a moment…“, linku samotnou jsem neověřil. |
| **GLA** Glasgow | ✅ ano | 2 £ od 7. 9. 2026 | – | https://www.firstbus.co.uk/greater-glasgow/tickets/ps2-fare-cap | „All single journeys on First Bus services across Glasgow and the surrounding areas are capped at just £2 from 7 September“ a „Even £2 to start your journey to the airport on the Glasgow Airport Express.“ |
| **BOH** Bournemouth | ❌ ne | – | – | – | morebus.co.uk vrací 403 „Just a moment…“, web letiště se nenačetl (časový limit). Sekundárně (bustimes.org): 737 jezdí jen po–pá, 2 ranní a 3 odpolední spoje, registrace do 11. 9. 2026 – stojí za ověření, jestli linka po tomto datu ještě jezdí. |
| **HKT** Phuket | ❌ ne | – | – | – | Čistou oficiální stránku s cenou jsem nenašel. Stránku airportbusphuket.com jsem podle pokynu neotvíral. Sekundárně: 100 THB, 1 h 15 až 1 h 30. |

## C) Dosud jen sekundární zdroj

| Letiště | Oficiální zdroj | Jízdné | Čas | URL | Citace / poznámka |
|---|---|---|---|---|---|
| **CHQ** Chania | ✅ nalezen, **jiná cena** | **2,20 €** | – | https://www.e-ktel.com/images/AIRPORT_FROM_01-10-2026_TO_24-10-2026.pdf (odkaz ze stránky https://www.e-ktel.com/en/services/dromologia) | Jízdní řád „BUS ROUTES FROM AND TO CHANIA AIRPORT“, řádek „ΤΙΜΕΣ ΕΙΣΙΤΗΡΙΩΝ / TICKET PRICES 2,20 €“ (dál Chania–Pithari 2,20 €, Chania–Pazinos 2,70 €). |
| **JSI** Skiathos | ✅ nalezen, **jiná cena** | **3,00 €** (jízdenka 1) | – | https://skiathostransports.gr/en/tickets/ | Ceny jsou jen v obrázcích jízdenek: „TICKET 1 – 3,00 €“, „TICKET 2 – 2,20 €“. Trasy s jízdenkou 1: „Αεροδρόμιο-Κουκουναριές / Σκιάθος-Κουκουναριές …“, tedy linka z letiště. Úsek letiště–město zvlášť uveden není. |
| **AGA** Agadir | ✅ nalezen | 50 MAD | 50 min | https://www.alsa.ma/navette-aeroport | „Le prix du billet normal est de 50dhs/personne. Nous offrons le billet aller-retour à 80dhs valable pour 15 jours.“ a „un trajet de 50 minutes“. |
| **RBA** Rabat | ✅ nalezen | 25 MAD | 45–50 min (Rabat Agdal) | https://www.alsa.ma/rabat/navette-aeroport-rabat | „25 MAD par passager (aller simple) · 40 MAD par passager (aller-retour, valable 15 jours)“, „Aéroport ↔ Rabat Agdal : environ 45 à 50 minutes“. |
| **TNG** Tanger | ❌ nenalezen | – | – | – | ALSA nemá pro Tanger stránku (adresy vrací 404). Sekundární zdroje se neshodnou, jestli spoj vůbec jezdí. |
| **FEZ** Fès | ❌ nenalezen | sekundárně 3,5–4 MAD | ~40 min | – | Jen cestovatelské weby. |
| **SHJ** Šardžá | ⚠️ zčásti | 6 AED s kartou Sayer | – | https://www.srta.gov.ae/en-us/Transport-Sector/Sayer-Card.html | „Blue Card: 6 Dhs for the ticket by using the main sayer card, that gives 25% off on the main ticket“ – z toho vychází 8 AED v hotovosti. Karta stojí 5 AED. Cenu letištní linky zvlášť SRTA neuvádí; sekundárně linka 15 na Rollu 9 AED hotově / 7 AED s kartou. |
| **CAI** Káhira | ❌ nenalezen | sekundárně 5–15 EGP | 45–75 min | – | Jen sekundární zdroje. |
| **CNX** Čiang Mai | ❌ nenalezen | sekundárně 50 THB z letiště (jinde 30 THB) | – | – | Stránka letiště AOT vrací 404. |
| **MLE** Male | ❌ nenačte se | sekundárně bus R3 10 MVR, trajekt 15 MVR | 25 min / 10 min | – | mtcc.mv vrací 403 „Just a moment…“, rtl.mv/bus-routemap vypršel časový limit. |
| **LGW** Gatwick | ❌ nenalezen | sekundárně 10,70 £ mimo špičku, **19,20 £ ve špičce** (bezkontaktně) | ~30 min | – | Stránku Southern s cenou jsem nenašel. Pozor: 10,70 £ je podle sekundárního zdroje jen mimošpičková cena. |
| **OSL** Oslo | ❌ nenalezen | sekundárně 129 NOK | 23–25 min | – | Stránku Vy s cenou jsem nenašel. |
| **FAO** Faro | ❌ nenačte se | sekundárně 2,50 € | 15 min | https://www.proximo.pt/ | Web je aplikace, sekci „Tickets & Fares“ se mi nepodařilo otevřít. |
| **AMS** Amsterdam | ❌ ne | – | – | https://www.ns.nl/en/journeyplanner/ | Plánovač se načetl a ukázal spoje, cenu v textu ne. |
| **RAK** Marrákeš | ❌ nenalezen | sekundárně 30 MAD (zpáteční 50 MAD) | – | – | ALSA nemá pro Marrákeš stránku na adresách, které jsem zkoušel (404). |
| **BKK** Bangkok | ❌ nenačte se | sekundárně 45 THB | – | – | Doména srtet.co.th se nepřeložila (DNS). |

## D) Chybějící letiště

| Letiště | Jízdné | Čas | Spoj | URL | Citace |
|---|---|---|---|---|---|
| **SBZ** Sibiu | **3,5 lei** (jízdenka na 60 min) | neuveden | Tursib linka **11** (také 112, 116, 117, 118), zastávka „AEROPORT TERMINAL“ před příletovou halou | https://www.sibiuairport.ro/en/info/transport-public ; ceník https://www.tursib.ro/page/tarife | „Tickets can be purchased directly from the bus, as Tursib buses are equipped with contactless machines. The price of a 60-minute ticket is 3,5 lei.“ Ceník Tursib: „Bilet intern 60 minute … 3.5 lei“. |
| **VAR** Varna | **1,00 €** (1,96 lv, 60 min, z automatu); v aplikaci 0,51 € | **do 20 min** do centra | autobus **409** | https://varna-airport.bg/en/getting-around/public-transport ; ceny https://visit.varna.bg/en/public-transport-in-varna.html | Letiště: „you may take Bus №409. The duration of the journey to the city center is under 20 minutes“, „A ticket can be purchased inside the bus.“ Město: „60 minutes 1.96 lv. / 1,00 €“, „Bus line № 409 connects the airport with the shopping centers, bus station, city center/cathedral…“. |

## Co se nepovedlo a proč

- **Blokování automatizace (403 „Just a moment…“):** transdevbus.co.uk, morebus.co.uk, mtcc.mv. Stránky by se nejspíš načetly v ručně ovládaném okně.
- **Cena až po vyplnění formuláře:** ADO (Cancún), e-shop letiště Marseille, Havaş.
- **Nenačetlo se:** bournemouthairport.com a rtl.mv (časový limit), srtet.co.th (DNS).
- **Neuhodl jsem správnou adresu:** Southern, Vy, ALSA Marrákeš/Tanger, letiště Phuket a Čiang Mai – zkoušené adresy vracely 404 a přes vyhledávač jsem oficiální stránku s cenou nenašel.
- Hodnoty označené „sekundárně“ pocházejí z výpisu vyhledávače, ne ze stránky, kterou jsem sám přečetl.
