# Průzkum route7 (6. 10. 2026)

Měřeno ze skutečného Chromu na Windows z domácí sítě v ČR (playwright-core, okno mimo obrazovku), 6. 10. 2026 odpoledne. Kód v repozitáři jsem neměnil. Skripty, snímky a surová data jsou lokálně v `%TEMP%\atlas-qa` (`route7-*.js`, složka `route7\`). Bod 4 zpracoval pomocný agent z webových zdrojů, zbytek jsem měřil sám.

## 1) Skutečné časy přejezdů (Google Mapy)

- **A** = odjezd nastavený na **středu 7. 10. 2026 v 10:00 místního času** – Google ukazuje „typicky od–do".
- **B** = „odjezd teď", úterý 6. 10. 2026 asi 13:30 SELČ (12:30 v Lagosu), tedy s aktuálním provozem.
- **OSRM** = veřejný router.project-osrm.org (bez provozu), pro srovnání s tím, co dává běžný routovací engine.

| Trasa | km po silnici (Google) | Auto A: typicky st 10:00 | Auto B: teď | OSRM bez provozu | Vzdušně | Veřejná doprava v Google Mapách | Vlak? |
|---|---|---|---|---|---|---|---|
| Lagos → Porto-Novo | 117 (alternativy 110–124) | **2 h 30 – 3 h 40** | 2 h 48 | 1 h 26 (111 km) | 83 km | jen řetěz městských autobusů, BRT a přívozu po Lagosu, 6 h 23 – 6 h 33, s varováním „We don't have the most recent timetables for this area" – pro odhad nepoužitelné | ne |
| Porto-Novo → Abeokuta | 150 (alternativa 163) | **typicky 3 h 20** (alt. 3 h 10 – 3 h 30) | 3 h 12 | 2 h 16 (151 km) | 108 km | „Sorry, your search appears to be outside our current coverage area for transit" | ne |
| Lagos → Cotonou | 128 (alternativa 134) | **2 h 50 – 4 h 10** | 3 h 07 (mýto, hranice) | 1 h 34 (124 km) | 111 km | mimo pokrytí (stejná hláška) | ne |
| Praha → Brno | 205 | **2 h – 3 h 20** | 2 h 11 | 2 h 11 (206 km) | 184 km | 2 h 20 – 2 h 56: FlixBus 2 h 20 a 2 h 35 (256 Kč), RJX 251 2 h 37, RegioJet RJ 1043 2 h 34, Leo Express 2 h 43, vlak 867 2 h 56 | ano |
| Milán → Bologna | 221 (alternativy 213–216) | **2 h 10 – 3 h 30** | 2 h 25 | 2 h 20 (211 km) | 201 km | vlak Frecciarossa 57 min – 1 h 07 (52 €) | ano, vysokorychlostní |
| Vídeň → Salcburk | 296 (alternativa 332) | **3 h – 4 h 30** | 3 h 16 | 3 h 10 (296 km) | 251 km | vlak RJX 2 h 18, WESTbahn 2 h 23 (53,99 €) | ano |

**Co z toho plyne pro kalibraci**

- **Evropa, dálnice:** OSRM bez provozu sedí na spodní hranici Googlu (poměr Google teď / OSRM = 1,00–1,04). Průměrná rychlost 91–94 km/h. Horní hranice „typicky" je o 45–55 % výš.
- **Nigérie–Benin:** Google je 1,4–2× pomalejší než OSRM (Lagos → Porto-Novo ×1,95; Lagos → Cotonou ×1,99; Porto-Novo → Abeokuta ×1,41). Průměrná rychlost jen 37–47 km/h.
- **Silnice vs. vzdušná čára:** 1,41 (Lagos → Porto-Novo), 1,39 (Porto-Novo → Abeokuta), 1,15 (Lagos → Cotonou), 1,10–1,18 v Evropě.
- U všech tří afrických tras Google hlásí „This route crosses a country/region border". Čekání na hranici (Seme–Krake) v čase není; kolik zabere, jsem neměřil.
- **Vlak v Africe:** Google žádný neukázal. Že mezi Nigérií a Beninem osobní vlak nejezdí, uvádím podle obecně známého stavu – v jízdních řádech jsem to dnes neověřoval.
- Veřejnou dopravu Google umí jen v Evropě. U Lagos → Porto-Novo vrátil nesmyslný řetěz městských linek, u zbylých dvou tras nic.

**Jak měření zopakovat:** `https://www.google.com/maps/dir/{odkud}/{kam}/data=!4m6!4m5!2m3!6e0!7e2!8j{ts}!3e{mód}?hl=en`, kde `mód` 0 = auto, 3 = veřejná doprava a `ts` je místní čas odjezdu zapsaný jako UTC sekundy (`Date.UTC(2026, 9, 7, 10, 0, 0) / 1000` = 1791367200). Bez části `data=` (tvar `…/maps/dir/?api=1&origin=…&destination=…&travelmode=driving`) se počítá „odjezd teď".

## 2) Předvyplněné odkazy na ubytování (Cotonou, 22.–23. 11. 2026, 1 dospělý)

Každý odkaz jsem otevřel v čistém profilu a přečetl vyhledávací pole na stránce.

| Web | Funkční vzor URL | Co se předvyplnilo | Poznámka |
|---|---|---|---|
| **Booking.com** ✅ | `https://www.booking.com/searchresults.cs.html?ss=Cotonou%2C+Benin&checkin=2026-11-22&checkout=2026-11-23&group_adults=1&no_rooms=1&group_children=0&lang=cs&selected_currency=CZK` | město „Cotonou", „ne, 22. listopadu — po, 23. listopadu", „1 dospělý · 0 dětí · 1 pokoj"; 288 ubytování | stačí jméno města |
| **Airbnb** ✅ | `https://www.airbnb.cz/s/Cotonou--Benin/homes?checkin=2026-11-22&checkout=2026-11-23&adults=1` | „Domovy v destinaci Cotonou", „22.–23. 11.", „1 host"; přes 1000 domovů | stačí jméno; `adults=1` funguje |
| **Hostelworld** ⚠️ | `https://www.hostelworld.com/pwa/s?q=Cotonou,%20Benin&country=Benin&city=Cotonou&type=city&id=5504&from=2026-11-22&to=2026-11-23&guests=1&page=1` | „Cotonou, Benin", „22 Nov - 23 Nov", Guests 1; 46 ubytování | **potřebuje číselné `id` města** (Cotonou = 5504). Bez `id` je 404 |
| **Agoda** ⚠️ | `https://www.agoda.com/search?city=20636&checkIn=2026-11-22&checkOut=2026-11-23&los=1&rooms=1&adults=1&children=0` | „Cotonou", „22. lis 2026 – 23. lis 2026", „Dospělí: 1 Pokoj: 1"; 284 ubytování | **potřebuje číselné `city`** (Cotonou = 20636). `search?textToSearch=Cotonou` přesměruje na úvodní stránku |
| **Hotels.com** ✅ | `https://www.hotels.com/Hotel-Search?destination=Cotonou%2C%20Benin&startDate=2026-11-22&endDate=2026-11-23&adults=1&rooms=1` | „Cotonou, Littoral, Benin", „Sun, Nov 22 - Mon, Nov 23", „1 traveler, 1 room"; 64 ubytování | stačí jméno; web si sám doplní `regionId=898`. Doména `cz.hotels.com` neexistuje (chyba SSL) |
| **Expedia** ✅ | `https://www.expedia.com/Hotel-Search?destination=Cotonou%2C%20Benin&startDate=2026-11-22&endDate=2026-11-23&adults=1&rooms=1` | totéž co Hotels.com; 81 ubytování | stejný systém jako Hotels.com |
| **Trip.com** ⚠️ | `https://www.trip.com/hotels/list?cityId=3251&checkin=2026-11-22&checkout=2026-11-23&crn=1&adult=1&children=0` | „Cotonou", „Sun, Nov 22 - Mon, Nov 23", „1 room, 1 adult, 0 children"; 132 ubytování | **potřebuje `cityId`** (Cotonou = 3251; starší `city=3251` funguje taky). Jen `cityName=Cotonou` vyplní pole, ale vrátí 0 výsledků |
| **Kayak** ✅ | `https://www.kayak.com/hotels/Cotonou/2026-11-22/2026-11-23/1adults` (česky a v Kč: `https://www.cz.kayak.com/hotels/Cotonou,Benin-c22853/2026-11-22/2026-11-23/1adults`) | „Cotonou", „Nov 22 – Nov 23", „1 guest"; 311 nabídek | **jen samotné jméno města** – Kayak přesměruje na `Cotonou-c22853`. Tvar „Město,Země" bez ID (`Cotonou,Benin`, `Brno,Czech-Republic`) spadne na úvodní `/stays` bez předvyplnění |
| **Google Hotels** ⚠️ | `https://www.google.com/travel/search?q=hotels%20in%20Cotonou%2C%20Benin&hl=cs&curr=CZK&ts=CAESBgoCCAMQABogCgIaABIaEhIKBwjqDxALGBYSBwjqDxALGBcYATICEAAqCQoFOgNDWksaAA` | „Příjezd ne 22. 11.", „Odjezd po 23. 11.", počet hostů 1; 226 výsledků | data a hosty nese jen parametr **`ts`** (kódovaný protobuf, generátor níže) |

**Co nefunguje**

- **Hostelworld – oba tvary, které teď ATLAS používá, vrací 404:** `https://www.hostelworld.com/s?q=Cotonou&from=…&to=…` (`public/js/app.js` ř. 483) i `https://www.hostelworld.com/hostels/Cotonou` (`server/lib/links.js` ř. 52). Bez ID funguje jen městská stránka `https://www.hostelworld.com/hostels/africa/benin/cotonou/` (kontinent/země/město malými písmeny); ta vyplní město, ale parametry `from`, `to` a `guests` ignoruje (ukáže nejbližší dny a 2 hosty).
- **Google Hotels:** `&checkin=…&checkout=…&adults=1` ani `&hotel_dates=…&hotel_occupancy=1` nedělají nic (zůstane výchozí 25.–26. 10. a 2 hosté). Anglická věta v `q` („… from 22 November 2026 to 23 November 2026 for 1 adult") nastaví data, ale ne hosty, a zúží výsledky na 6. Dnešní odkaz ATLASu (`q=hotels Cotonou, Benin`) tedy předvyplní jen město.
- **Agoda, Trip.com, Hostelworld** bez číselného ID města data nepředvyplní.

**Kde vzít ID města**

- Kayak (není nutné): `https://www.kayak.com/mvm/smartyv2/search?f=j&s=50&where=Cotonou&lc=en&lc_cc=US&v=v1` → pole `ctid` (22853). Voláno z otevřené stránky kayak.com.
- Agoda: stránka `https://www.agoda.com/city/cotonou-bj.html` (město-kód země) má ID v HTML (20636). Sama předvyplní jen město.
- Hostelworld: městská stránka obsahuje odkaz `…/pwa/s?q=Cotonou%2C+Benin&country=Benin&city=Cotonou&type=city&id=5504…`.
- Trip.com: ID jsem získal jen přes vyhledávací pole na webu (napsat město, potvrdit); veřejné API jsem nehledal.

**Generátor `ts` pro Google Hotels** (ověřeno pro 22.–23. 11. 2026, 1 dospělý, CZK; jiné kombinace jsem nezkoušel):

```js
const gDate = iso => { const [y, m, d] = iso.split('-').map(Number); return [0x08, (y & 0x7f) | 0x80, y >> 7, 0x10, m, 0x18, d]; };
function googleHotelsTs(checkin, checkout, adults, currency = 'CZK') {
  const guests = [...Array.from({ length: adults }, () => [0x0a, 0x02, 0x08, 0x03]).flat(), 0x10, 0x00];
  const d1 = gDate(checkin), d2 = gDate(checkout);
  const dates = [0x0a, d1.length, ...d1, 0x12, d2.length, ...d2];
  const nights = Math.round((new Date(checkout) - new Date(checkin)) / 864e5);
  const stay = [0x12, dates.length, ...dates, 0x18, nights, 0x32, 0x02, 0x10, 0x00];
  const f3 = [0x0a, 0x02, 0x1a, 0x00, 0x12, stay.length, ...stay];
  const cur = [...Buffer.from(currency)];
  const f5 = [0x0a, cur.length + 2, 0x3a, cur.length, ...cur, 0x1a, 0x00];
  return Buffer.from([0x08, 0x01, 0x12, guests.length, ...guests, 0x1a, f3.length, ...f3, 0x2a, f5.length, ...f5])
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
// googleHotelsTs('2026-11-22', '2026-11-23', 1) === 'CAESBgoCCAMQABogCgIaABIaEhIKBwjqDxALGBYSBwjqDxALGBcYATICEAAqCQoFOgNDWksaAA'
```

Je to odpozorovaný formát, ne dokumentované API – Google ho může změnit. Délky jsou jednobajtové, takže to platí pro běžné počty hostů a pobyt do 127 nocí.

## 3) Ceny pohonných hmot

### ČSÚ – týdenní průměrné ceny v ČR

Datová sada **CENPHMT** „Průměrné spotřebitelské ceny pohonných hmot – týdenní" (od 1. týdne 2016, aktualizace týdně). Bez klíče a bez přihlášení, funguje i obyčejný `curl`.

- **CSV, celá řada:** https://data.csu.gov.cz/api/dotaz/v1/data/sady/CENPHMT?format=CSV (1 872 řádků; sloupce `Ukazatel, Druh PHM, Území, Týdny, Hodnota, …`)
- **CSV, výběr (nejnovější týden nahoře):** https://data.csu.gov.cz/api/dotaz/v1/data/vybery/CENPHMTT01?format=CSV
- **JSON-stat:** https://data.csu.gov.cz/api/dotaz/v1/data/vybery/CENPHMTT01?format=JSON_STAT
- Popis sady: https://data.csu.gov.cz/api/katalog/v1/sady/CENPHMT · web: https://data.csu.gov.cz/datastat/info/SADA/CENPHMT

Filtruj `Ukazatel = "Průměrná cena pohonných hmot (Kč/litr)"`; druhy jsou „Benzin automobilový bezolovnatý Natural 95 oktanu", „Motorová nafta" a „LPG". Sada obsahuje i ukazatel „Index cen pohonných hmot (%)".

| Týden 2026 | Natural 95 (Kč/l) | Nafta (Kč/l) |
|---|---|---|
| 36. | 42,02 | 45,92 |
| 37. | 43,71 | 47,39 |
| 38. | 44,40 | 48,37 |
| 39. | 45,88 | 50,43 |
| **40. (28. 9. – 4. 10.)** | **45,87** | **50,65** |

Staženo 6. 10. 2026; 41. týden v datech ještě není. LPG ve 40. týdnu 21,62 Kč/l.

### EU Weekly Oil Bulletin

- Stránka: https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en
- **Aktuální ceny s daněmi (XLSX):** https://energy.ec.europa.eu/document/download/264c2d0f-f161-4ea3-a777-78faae59bea0_en – stálá adresa, funguje i bez parametru `filename` a bez hlavičky prohlížeče. Jen XLSX, CSV ani JSON není. Jeden list: řádek 1 = hlavičky, buňka A2 = datum (excelové číslo), země v řádcích 3–29, sloupec B = Euro-super 95, C = motorová nafta, vše v EUR za 1000 l včetně daní.
- **Historie od roku 2005 (XLSX):** https://energy.ec.europa.eu/document/download/906e60ca-8b6a-44e7-8589-652854d2fd3f_en?filename=Weekly_Oil_Bulletin_Prices_History_maticni_4web.xlsx (neotvíral jsem)

Ceny platné k **28. 9. 2026** (v souboru A2 = 46293; odkaz na stránce má v názvu ještě „2026-09-21"):

| Země | Euro-super 95 (€/l) | Nafta (€/l) | ≈ Natural 95 (Kč/l) | ≈ Nafta (Kč/l) |
|---|---|---|---|---|
| CZ | 1,880 | 2,076 | 45,87 | 50,65 |
| DE | 2,345 | 2,437 | 57,2 | 59,5 |
| AT | 1,956 | 2,259 | 47,7 | 55,1 |
| SK | 1,853 | 1,978 | 45,2 | 48,3 |
| EU-27 (vážený průměr) | 2,104 | 2,237 | 51,3 | 54,6 |

Přepočet na koruny kurzem 24,40 Kč/€ – ten vychází z porovnání české hodnoty v bulletinu s ČSÚ (45,87 Kč ÷ 1,880 €). Česká čísla v bulletinu jsou tedy stejná data jako 40. týden ČSÚ.

## 4) Ceny rychlonabíjení elektroaut (DC) v ČR – ad-hoc bez předplatného

Zpracoval pomocný agent z webových zdrojů 6. 10. 2026; čísla jsem sám znovu neověřoval. U každého řádku je uvedeno, jestli jde o oficiální ceník, nebo o sekundární zdroj.

Ceny jsou v Kč/kWh **včetně DPH 21 %**, pokud není uvedeno jinak. "Ad-hoc" = jednorázové dobití bez smlouvy a měsíčního poplatku (karta / QR / terminál / neregistrovaný uživatel v aplikaci).
Ověřeno 6. 10. 2026 (WebFetch a stažení oficiálních stránek a PDF přes curl).

### Tabulka

| Provozovatel | Ad-hoc DC cena (Kč/kWh vč. DPH) | Pásma výkonu | Další poplatky | Cena s registrací/tarifem (pro srovnání) | Zdroj (URL) | Platnost ceníku / datum ověření |
|---|---|---|---|---|---|---|
| **ČEZ (futurego / ČEZ Elektromobilita)** | **16,90** (DC do 149 kW); **22,90** (UFC od 150 kW); AC do 49 kW 11,90 | do 49 kW / do 149 kW / od 150 kW | Bez startovního poplatku, měsíční poplatek 0 Kč. Blokační poplatek 2 Kč/min: od 481. min (do 49 kW), od 91. min (do 149 kW), od 46. min (od 150 kW), nebo od 11. minuty po dokončení nabíjení | Basic (zdarma, aktivuje se po registraci): 9,90 / 12,90 / 15,90. Standard (100 Kč/měs.): 9,90 / 12,40 / 12,40. Premium (300 Kč/měs.): 9,90 / 11,40 / 11,40 | https://www.futurego.cz/cenik (oficiální) | Ad-hoc ceník od 1. 4. 2026; ceník pro registrované od 1. 6. 2026; ověřeno 6. 10. 2026 |
| **PRE (PRE POINT)** | **13,00** (DC do 149 kW); **15,00** (UFC nad 149 kW); AC do 49 kW 10,00 | do 49 kW / do 149 kW / nad 149 kW | Parkovací/blokační poplatek: AC 3 h zdarma pak 1 Kč/min; DC 1 h zdarma pak 2 Kč/min; UFC 30 min zdarma pak 2 Kč/min. Platba kartou přes QR, na DC/UFC i terminál (předautorizace). Bez startovního poplatku | PRE CHARGE Start (zdarma, pro ty, kdo neodebírají elektřinu/plyn od PRE): AC 9 / DC 12 / UFC 14. Silver (150 Kč/měs.): 8 / 11 / 13. Platinum (300 Kč/měs.): 7 / 10 / 11. Zákazníci PRE Silver zdarma: 8 / 11 / 13 | Ad-hoc: https://www.pre.cz/cs/domacnosti/emobilita/verejne-dobijeni/chci-dobijet-jednorazove/ ; tarify: https://www.pre.cz/Files/emobilita/cenik/cenik-dobijeni-v-siti-pre-point-aktualne-platny/ (oficiální) | Stránka ad-hoc nemá uvedené datum platnosti (copyright 2026); ceník tarifů platný od 1. 12. 2025 (označen "aktuálně platný"); ověřeno 6. 10. 2026 |
| **E.ON Drive** | Den (8-20 h): **10,50** (skupina 1, do 100 kW); **14,50** (skupina 2, 101-200 kW); **20,00** (skupina 3, 201-400 kW). Noc (20-8 h): 8,50 / 11,00 / 14,00 | 3 skupiny podle max. výkonu dobíjecího bodu (už se nerozlišuje AC/DC/UFC) | Cena se mění plynule při přechodu den/noc (není fixovaná na začátek). Volné minuty: skupina 1 480 min (AC) / 120 min (DC), skupina 2 60 min, skupina 3 30 min. Sazba za překročení pro neregistrované je na webu uvedena jen jako "-" (určuje aplikace); registrovaní platí 2 Kč/min (1,65 Kč bez DPH). Platba kartou/QR, předautorizace | Registrovaný (zdarma, 1. RFID karta zdarma): den 9,50 / 13,00 / 16,90; noc 8,00 / 10,00 / 12,00 | https://www.eon-drive.cz/pro-ridice/ (tabulka ad-hoc); PDF ceník registrovaných https://www.eon-drive.cz/wp-content/uploads/2026/06/2606_Cenik-dobijeni-E.ON-Drive.pdf (oficiální; vč. cen bez DPH, např. 7,85 bez DPH = 9,50 s DPH) | Kompletní ceník platný od 18. 6. 2026 (předchozí od 1. 4. 2026); podmínky jednorázového dobíjení od 1. 6. 2026; ověřeno 6. 10. 2026 |
| **IONITY** (jen UFC, dálnice) | **21,00** (IONITY Direct, bez registrace) podle oficiální stránky. Sekundární zdroje (23. 6. 2026) uvádějí od 1. 7. 2026 ad-hoc v ČR "až 22,68". Rozpor se nepodařilo vyřešit | Jedno pásmo (ultrarychlé UFC, výkon neověřován) | Ceny jsou "minimální", na konkrétní stanici mohou být vyšší. Idle/blokační poplatek: neověřeno | IONITY App/Go (bez předplatného, registrace v aplikaci): 19,95. Motion 15,58 (142 Kč/měs.; roční Motion 365 za 1 420 Kč = 15,00). Power 12,46 (305 Kč/měs.; Power 365 za 3 050 Kč/rok = 12,00) | Oficiální: https://www.ionity.eu/subscriptions (WebFetch 6. 10. 2026). Sekundární: https://fdrive.cz/clanky/ionity-meni-cenik-nabijeni-elektromobilu-od-cervence-podrazi-16916 (23. 6. 2026) a https://elektromobilni.pl/ionity-od-1-lipca-2026-roku-drozej-w-europejskiej-sieci-w-polsce-353-zl-za-kwh-bez-abonamentu/ (23. 6. 2026) | Oficiální stránka bez data platnosti ("All prices include local VAT"); změna cen uváděna od 1. 7. 2026 |
| **Tesla Supercharger** (cizí značky, bez členství, přes Tesla app) | **Mimo špičku (0-9 a 22-24 h): 8,10-8,80. Ve špičce (9-22 h): 13,10-13,30**. Na některých stanicích jednotně až 14,14 celý den | Cena se nerozlišuje podle výkonu, jen podle stanice a času (špička/mimo špičku) | Poplatek za blokování po dokončení nabíjení: po 5 min tolerance 10 Kč/min při obsazenosti 50 % a víc, 20 Kč/min při 100 % obsazenosti | Majitelé Tesla: mimo špičku 5,80-6,20, špička 9,40-9,60, až 10,10 celý den na některých stanicích. Cena s členstvím pro cizí značky: neověřeno | Sekundární: https://elektrickevozy.cz/clanky/tesla-supercharger-cena-nabijeni-v-cesku (aktualizováno 1. 2. 2026); souhrn s ~8,45 / ~13,20 viz autohled.cz níže | Tesla sama jednu cenu nezveřejňuje (cena v aplikaci podle stanice a času); data z února 2026, ověřeno jen sekundárně |
| **Shell Recharge** | **15,00** na většině stanic (DC/UFC); 10,00 na dvou výjimkách (Penny Market Kostelec nad Labem, Shell Ústí nad Labem) | DC/UFC (autohled uvádí až 320 kW, úryvek shell.cz až 180 kW) | Předautorizace 500 Kč na kartě (QR/karta). Blokační poplatek: neověřeno | Bez tarifů a bez registrace, jedna cena | Oficiální stránka https://www.shell.cz/dobijeni/cenik.html je vykreslována JavaScriptem (text nešel stáhnout, jen úryvek z vyhledávače potvrzující 15 Kč, Ústí 10 Kč, 500 Kč). Sekundární: autohled.cz (5. 10. 2026) | Datum na stránce Shell neověřeno; autohled kontroloval 5. 10. 2026 |
| **MOL Plugee** | **14,50** (DC do 99 kW); **15,50** (UFC 100+ kW); AC do 25 kW 10,00 (neregistrovaný) | do 25 kW / do 99 kW / 100+ kW | 0,50 Kč/min po 30 min u AC; blokační poplatek u DC neověřen | Registrovaný (zdarma): AC 8,30 / DC 13,00 / UFC 14,00 | Sekundární: https://www.autohled.cz/magazin/ceny-nabijeni-elektromobilu-v-cesku-2026-kompletni-prehled-vsech-operatoru/10864 (oficiální ceník MOL nenalezen) | Kontrola autohled 5. 10. 2026; datum platnosti ceníku neověřeno |
| **Kaufland a Benzina/ORLEN** | Provozuje ČEZ, platí stejný ceník jako futurego (ad-hoc DC 16,90 / UFC 22,90) | viz ČEZ | viz ČEZ | Dřívější sazba 5,90 u Kauflandu už neplatí | Sekundární: autohled.cz (5. 10. 2026); oficiálně potvrzuje ČEZ ceník výše jen pro síť futurego | 5. 10. 2026 (sekundární) |
| **Lidl** | Neověřeno. Autohled uvádí DC (max 50 kW) 10,00 a AC 7,00, ale sám značí, že jde o údaje z roku 2024, které nešlo ověřit. Lidl cenu na webu nezveřejňuje, zobrazuje ji jen app Lidl Plus | max 50 kW | neověřeno | Pro registrované zákazníky E.ON Drive (roaming, ceník E.ON od 18. 6. 2026) vychází u Lidlu AC 10, DC do 149 kW 13, UFC 15 Kč (text PDF z pdftotext, mírně nepřehledná tabulka) | autohled.cz (výše); E.ON PDF (výše) | Údaje z roku 2024 (neověřeno) / E.ON roaming 18. 6. 2026 |
| **Teplárny Brno (regionální)** | 17,80 DC (neregistrovaný); AC 13,00 | jen Brno a okolí | 1 Kč/min od 241. min AC / od 61. min DC, jen 7-19 h | Registrovaný: DC 10,50-12,50, AC 8,30 | Sekundární: autohled.cz (5. 10. 2026) | Ceník platný od 1. 7. 2025 (starší) |
| **Pražská plynárenská (PP)** | Neověřeno | | | | Hledáno ve vyhledávači, bez relevantního výsledku (jen PRE) | |
| **GreenWay (CZ)** | Neověřeno | | | | Hledáno ve vyhledávači, vrátily se jen polské ceny GreenWay | |

### Poznámky

**Oficiální zdroje (stažené a přečtené 6. 10. 2026):**
- ČEZ: futurego.cz/cenik (WebFetch; hodnoty se shodují s autohled.cz i s vyhledávačem). PDF na cez.cz (cenik_elektromobilita_dobijeni_en.pdf, vytvořeno 6. 2. 2026) je obrázkové a nešlo ho přečíst; elektromobilita.cz jsem neotevíral, protože cez.cz/cs/elektromobilita/nabijeni/cenik vrací 404.
- PRE: stránka jednorázového dobíjení na pre.cz (HTML stažený přes curl) a PDF ceník tarifů. Ad-hoc stránka nemá datum, takže "platnost" je jen "aktuálně zobrazeno".
- E.ON Drive: HTML eon-drive.cz/pro-ridice (tabulka Neregistrovaný/Jednorázové dobití) a PDF z června 2026. PDF obsahuje jen registrované a roamingové ceny, ne ad-hoc. Starší odkazy na ccs.cz/files/... vracejí 404 (vyhledávač je ještě indexuje).
- IONITY: ionity.eu/subscriptions přes WebFetch; ostatní URL (ionity.eu/en/pricing atd.) vrací 404.

**Sekundární / nejistá data:**
- Tesla: jen sekundární (elektrickevozy.cz 1. 2. 2026; autohled cituje únor 2026 a sám hlásí, že oficiální zdroj nenačetl). Tesla mění ceny podle stanice a času a nepublikuje pevnou cenu. Nižší hodnota 8,1-8,8 platí jen v off-peak, ve špičce je Tesla pro cizí značky drahá jako ostatní sítě (13,1-13,3).
- IONITY: oficiální stránka dnes ukazuje Direct 21,00; fdrive.cz a elektromobilni.pl z 23. 6. 2026 uvádějí ad-hoc v ČR od 1. 7. 2026 "až 22,68" (průměrné zvýšení 4 %, předplatné od 12,00 beze změny). Nevím, zda oficiální stránka ještě neodráží zvýšení, nebo zda 21,00 je minimum a 22,68 maximum podle stanice. Pro odhad počítejte 21-22,7. Autohled má u Motion/Power prohozenou měsíční a roční variantu (podle ionity.eu: Motion měsíčně 15,58 a Motion 365 15,00; Power měsíčně 12,46 a Power 365 12,00).
- E.ON: oficiální novinka na eon-drive.cz (30. 3. 2026) tvrdí, že struktura cen platí stejně pro registrované i neregistrované. To odporuje tabulce na téže doméně (neregistrovaný je dražší o 1-3 Kč) i fdrive.cz (26. 3. 2026). Použil jsem tabulku, protože je aktuální (ceník od 18. 6. 2026). Autohled uvádí skupinu 3 přes den 19,90, ale sám poznamenává, že web E.ON uvádí 20,00. Platí 20,00.
- Shell a MOL: ceny jen z autohled.cz (5. 10. 2026), u Shellu navíc potvrzení 15 Kč a 500 Kč zálohy z úryvku shell.cz.
- Nic z uvedeného není cena bez DPH, všechny hodnoty v tabulce už DPH obsahují. PRE a E.ON navíc v PDF uvádějí i ceny bez DPH (13 Kč s DPH = 10,74 Kč bez; E.ON 9,50 = 7,85 bez).

### Souhrnný přehled

**Autohled.cz, "Ceny nabíjení elektromobilů v Česku 2026: kompletní přehled všech operátorů"**, autor Jiří Zelinka, publikováno 25. 3. 2026, poslední aktualizace 5. 10. 2026.
URL: https://www.autohled.cz/magazin/ceny-nabijeni-elektromobilu-v-cesku-2026-kompletni-prehled-vsech-operatoru/10864
Čísla (vč. DPH, DC bez registrace): ČEZ neregistrovaný DC 16,90 (UFC 22,90); IONITY Direct od 21,00 (App od 19,95); Shell 15,00; MOL Plugee 14,50 (DC do 99 kW), 15,50 (UFC); E.ON den 10,50 / 14,50 / 19,90 (web E.ON uvádí 20,00); Tesla cizí značky ~8,45 off-peak / ~13,20 peak (únor 2026, neověřeno); PRE ad-hoc článek neuvádí (jen tarifní Start 12,00 za DC).
Cena nabití na 300 km (48 kWh, Škoda Elroq, 16 kWh/100 km): ČEZ neregistrovaný DC 811 Kč, Shell 720 Kč, IONITY App 958 Kč, IONITY Direct 1 008 Kč, E.ON registrovaný den DC do 100 kW 456 Kč, ČEZ Basic 619 Kč.
Závěry článku: registrace je u všech operátorů zdarma a ušetří 20-40 % oproti neregistrovanému nabíjení; IONITY je bez předplatného nejdražší síť v ČR. Jednotný průměr článek neuvádí.
(Nezkoumáno: finance.cz "Srovnání cen nabíjení elektromobilů: kde vám registrace zdarma ušetří nejvíce?", datum neznámé; fdrive.cz srovnání z cenové vlny 2025 je starší.)

### Rozumný průměr pro odhad

**Rozumný průměr pro odhad: 16 Kč/kWh (rozmezí 13-22 Kč/kWh)** pro ad-hoc DC nabíjení bez registrace. Zdůvodnění: u rychlonabíječek do 150 kW leží ad-hoc ceny hlavních sítí kolem 13-17 Kč (PRE 13, MOL 14,5, E.ON 14,5 ve dne, Shell 15, ČEZ 16,9), u UFC nad 150 kW 15-23 Kč (PRE 15, Shell 15, E.ON 20, IONITY 21-22,7, ČEZ 22,9), takže vážený odhad pro cestu po dálnici vychází asi na 16-17. Při noci/off-peak (E.ON 8,5-11, Tesla 8-9) nebo s bezplatnou registrací (ČEZ Basic 12,9-15,9, PRE Start 12-14) bude levněji, na IONITY Direct a ČEZ UFC bez registrace draho (21-23).
