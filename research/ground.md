# Vlak a bus místo letadla – co jde reálně použít

- Datum průzkumu: 5. 10. 2026, Peterův počítač (běžná domácí síť), dotazy přes `curl`/Node a skutečný Chrome. Kód ATLASu jsem neměnil.
- Zkušební trasa: Praha → Vídeň, 6. 10. 2026 (zítra); srovnávací tabulka pro 9 měst na 13. 10. 2026.
- Surová data a skripty: `%TEMP%\atlas-qa\ground\` (`rj-search.json`, `fb-search.json`, `oebb-tt.json`, `oebb-prices.json`, `deeplinks.json`, `matrix-2026-10-13.json`, screenshoty `dl-*.png`).
- **Důležité omezení:** vše jsem volal z domácí adresy. Jestli stejná rozhraní odpoví i ze serveru na Renderu (datacentrová adresa), jsem ověřit nemohl – u webů s ochranou proti botům (ÖBB, DB) to nečekám.

## Shrnutí

| Zdroj | Bez klíče? | Ze serveru (bez Origin) | Z prohlížeče cizího webu (CORS) | Ceny | Podmínky | Deep link |
|---|---|---|---|---|---|---|
| **RegioJet** | ano | ano, HTTP 200 | **ne** – cizí `Origin` dostane 403 | ano (od–do, Kč/EUR) | veřejné podmínky pro API jsem nenašel | ano, ověřeno |
| **FlixBus** | ano | ano, HTTP 200 | ano (`Access-Control-Allow-Origin` vrací volající doménu) | ano | komerční automatické vytěžování podmínky zakazují; srovnávače jen se smlouvou (z druhé ruky) | ano, ověřeno |
| **ÖBB** | ano, anonymní token | ano (s hlavičkou prohlížeče), Cloudflare | neověřeno | ano | interní rozhraní e-shopu; ÖBB nabízí partnerům oficiální odkazy, widget a webservice | formát funguje jen částečně ověřen (viz níže) |
| **DB (bahn.de)** | – | **ne** – 403 `OPS_BLOCKED` (Akamai) | ne | – | – | neověřeno, automatický Chrome dostal chybu 751 |
| **DB přes `v6.db.transport.rest`** | ano | **teď ne** – HTTP 503 | – | ne | neoficiální komunitní služba, 100 dotazů/min | – |
| **ČD** | ne – partnerské Ticket API | 401 „Nezadané ID partnera“ | – | – | jen pro smluvní partnery | vlastní formát jsem nenašel; funguje IDOS |
| **Trainline, Omio** | API jen pro partnery (nezkoušel jsem) | – | – | – | partnerské / affiliate programy | stránka trasy, ověřeno; bez data |
| **Google Maps** | odkaz bez klíče | – | – | ne | Maps URLs jsou veřejné | ano, bez data |
| **Kiwi (už v ATLASu)** | – | – | – | – | – | vrací **jen lety**, žádné vlaky ani busy |

## Praha → 9 měst, 13. 10. 2026 (RegioJet a FlixBus, skutečné odpovědi)

| Cíl | Vzdušnou čarou | RegioJet | FlixBus |
|---|---|---|---|
| Vídeň | 250 km | 11 spojů (8 přímých, vlak i bus), nejrychleji 4 h 17, od 299 Kč | 39 spojů (35 přímých), 3 h 54, od 309 Kč |
| Berlín | 280 km | 6 přímých busů, 4 h 30, od 379 Kč | 60 přímých, 4 h 10, od 329 Kč |
| Mnichov | 300 km | 5 přímých busů, 4 h 45, od 299 Kč | 21 spojů (10 přímých), 4 h 30, od 419 Kč |
| Budapešť | 445 km | 5 přímých (vlak i bus), 6 h 57, od 399 Kč | 46 spojů (44 přímých), 6 h 11, od 559 Kč |
| Krakov | 395 km | 4 spoje (1 přímý), 5 h 50, od 319 Kč | 28 spojů (7 přímých), 7 h 00, od 279 Kč |
| Benátky | 535 km | nic | 30 spojů (4 přímé), 11 h 50, od 979 Kč |
| Paříž | 885 km | nic | 12 spojů (7 přímých), 12 h 45, od 1 158 Kč |
| Amsterdam | 710 km | 1 přímý bus, 14 h 30, od 1 119 Kč | 32 spojů (5 přímých), 12 h 20, od 1 098 Kč |
| Curych | 525 km | 1 přímý bus, 9 h 35, od 849 Kč | 16 spojů (6 přímých), 10 h 10, od 859 Kč |

Pro srovnání: Kiwi na Praha → Vídeň 6. 10. vrátilo jako nejlevnější „let“ 1 809 Kč s přestupem a 14 h 20 min na cestě; vlak RegioJet stojí 299 Kč a jede 4 h 20.

## 1. RegioJet – `brn-ybus-pubapi.sa.cz`

Stejné rozhraní, které používá web regiojet.cz. Bez klíče, bez přihlášení.

**Seznam měst a stanic** (146 kB, 15 zemí, 170 měst):
```
GET https://brn-ybus-pubapi.sa.cz/restapi/consts/locations
X-Lang: cs
```
ID měst: Praha 10202003, Vídeň 10202052, Berlín 10202072, Mnichov 10202006, Budapešť 10202091, Krakov 1225791000, Benátky 10202080, Paříž 10202096, Amsterdam 10202030, Curych 10202067, Brno 10202002.

**Hledání spojů:**
```
GET https://brn-ybus-pubapi.sa.cz/restapi/routes/search/simple?tariffs=REGULAR&fromLocationType=CITY&fromLocationId=10202003&toLocationType=CITY&toLocationId=10202052&departureDate=2026-10-06
X-Lang: cs
X-Currency: CZK        (s EUR vrací ceny v eurech: 12.9–20.9)
```
Odpověď (HTTP 200, 30 spojů na 3 dny dopředu; zkráceno):
```json
{"routes":[{"id":"8730597478","departureStationId":372825000,"departureTime":"2026-10-06T06:01:00.000+02:00",
  "arrivalStationId":3741302011,"arrivalTime":"2026-10-06T10:21:00.000+02:00","vehicleTypes":["TRAIN"],
  "transfersCount":0,"freeSeatsCount":190,"priceFrom":299,"priceTo":499,"pricesCount":3,"bookable":true,
  "travelTime":"04:20 h","vehicleStandards":["YELLOW"]}, …]}
```
6. 10. z Prahy do Vídně: vlaky 06:01, 09:01, 13:01, 16:01 (4 h 17–4 h 20, 299–649 Kč), busy 07:00, 11:00, 15:00, 18:00 (4 h 30–4 h 50, 299–599 Kč).

- **CORS:** bez hlavičky `Origin` a s `Origin: https://regiojet.cz` vrací 200; s `Origin: https://atlas-letenky.onrender.com` vrací **403**. Volat tedy jen ze serveru ATLASu, ne z prohlížeče.
- **Podmínky:** veřejnou dokumentaci ani podmínky použití tohoto rozhraní jsem nenašel (`/restapi/swagger.json` vrací 400, stránka s pravidly webu 404). Před nasazením doporučuji napsat RegioJetu.
- **Deep link (ověřeno v Chromu, předvyplní města i datum a ukáže výsledky):**
  `https://regiojet.cz/?departureDate=2026-10-06&fromLocationId=10202003&toLocationId=10202052&fromLocationType=CITY&toLocationType=CITY&tariffs=REGULAR`

## 2. FlixBus – `global.api.flixbus.com`

Bez klíče. Města mají UUID, zjistí se našeptávačem.

```
GET https://global.api.flixbus.com/search/autocomplete/cities?q=Praha&lang=cs&country=cz&flixbus_cities_only=false
→ [{"id":"40de1ad1-8646-11e6-9066-549f350fcb0c","name":"Praha","country":"cz","legacy_id":1374}, …]
   (Vídeň = 40de1f31-8646-11e6-9066-549f350fcb0c)

GET https://global.api.flixbus.com/search/service/v4/search?from_city_id=40de1ad1-8646-11e6-9066-549f350fcb0c&to_city_id=40de1f31-8646-11e6-9066-549f350fcb0c&departure_date=06.10.2026&products={"adult":1}&currency=CZK&locale=cs&search_by=cities&include_after_midnight_rides=1
```
Odpověď (HTTP 200, 42 spojů; zkráceno):
```json
{"trips":[{"results":{"direct:6e0c…":{"status":"available","transfer_type_key":"direct","provider":"flixbus",
  "departure":{"date":"2026-10-06T02:20:00+02:00","station_id":"9b6adf77-…"},
  "arrival":{"date":"2026-10-06T06:20:00+02:00","station_id":"dcbdc34e-…"},
  "duration":{"hours":4,"minutes":0},
  "price":{"total":489,"original":489,"total_with_platform_fee":498},
  "available":{"seats":39},"legs":[…]}, …}}],"stations":{…},"operators":{…}}
```
39 dostupných spojů za 379–699 Kč, 3 h 55–5 h 30; vyprodané mají `status: "full"` a cenu 0.

- **CORS:** odpoví i s cizím `Origin` a vrátí ho v `Access-Control-Allow-Origin`, šlo by to volat i z prohlížeče.
- **Podmínky:** podle výsledku vyhledávání (text podmínek jsem přímo neotevřel, česká stránka vrátila 404) zakazují komerční využití webu automatickými systémy („screen scraping“) a srovnávačům cen umožňují data převzít jen na základě písemné smlouvy. Beru to jako „bez dohody nepoužívat v produkci“.
- **Deep link (ověřeno, předvyplní města i datum):**
  `https://shop.flixbus.cz/search?departureCity=40de1ad1-8646-11e6-9066-549f350fcb0c&arrivalCity=40de1f31-8646-11e6-9066-549f350fcb0c&rideDate=06.10.2026&adult=1`

## 3. ÖBB – `shop.oebbtickets.at`

Rozhraní e-shopu za Cloudflare. Bez klíče, ale ve třech krocích a s hlavičkou prohlížeče:
```
GET  https://shop.oebbtickets.at/api/domain/v4/init            (Channel: inet)  → {"accessToken":"eyJ…", …}
GET  https://shop.oebbtickets.at/api/hafas/v1/stations?name=Praha&count=3      (AccessToken: <token>)
     → [{"number":5400014,"name":"Praha hl.n."}, …]      Wien Hbf = 1290401 (v odkazu 8103000)
POST https://shop.oebbtickets.at/api/hafas/v4/timetable         tělo: from/to (number, name), datetimeDeparture, passengers[ADULT], count
     → {"connections":[{"id":"90de…","from":{"name":"Praha hl.n.","departure":"2026-10-06T08:37:00.000"},
        "to":{"name":"Wien Hbf","arrival":"2026-10-06T12:49:00.000"},"duration":15120000,"switches":0, …}]}
GET  https://shop.oebbtickets.at/api/offer/v1/prices?connectionIds[]=<id>&…
     → {"offers":[{"connectionId":"90de…","price":90.1},{"connectionId":"064e…","price":21,"specialNote":{"en":"Sparschiene ticket"}}, …]}
```
6. 10.: railjet 55 v 08:37 (4 h 12, 90,10 €), spoj v 09:37 s přestupem (4 h 12, Sparschiene 21 €), další 93,10 €.

- **Ochrana:** z příkazové řádky s hlavičkou prohlížeče prošlo; automaticky řízený Chrome dostal na stránce e-shopu ověření Cloudflare („nejste bot“, HTTP 403). Ze serveru v datacentru bych s průchodem nepočítal.
- **Podmínky:** jde o interní rozhraní. ÖBB na stránce „Online-Kooperationen“ nabízí partnerům oficiálně: upravitelný odkaz do e-shopu s přednastavenou stanicí, vložitelný vyhledávací widget a webservice (částečná nebo plná integrace) – vše po vyplnění poptávkového formuláře. Affiliate program tam uvedený není.
- **Deep link:** `https://shop.oebbtickets.at/en/ticket?stationOrigEva=5400014&stationDestEva=8103000&outwardDateTime=2026-10-06T08:00` – formát jsem převzal z praxe, oficiální popis parametrů jsem nenašel a v automatickém Chromu ho zastavilo ověření Cloudflare, takže **není ověřený**.

## 4. DB

- **bahn.de:** vyhledání stanic projde (`GET https://www.bahn.de/web/api/reiseloesung/orte?suchbegriff=Praha hl.n.` → `extId 5400014`), ale hledání spojů `POST https://www.bahn.de/web/api/angebote/fahrplan` vrací **403** `{"status":"ERROR","code":"OPS_BLOCKED"}` – ochrana Akamai, s hlavičkou prohlížeče i bez ní.
- **`v6.db.transport.rest`:** dnes **HTTP 503** na `/locations` i `/journeys`. Dokumentace uvádí, že jde o neoficiální obal, bez přihlášení, limit 100 dotazů za minutu, a že původní rozhraní DB HAFAS „bylo zřejmě trvale vypnuto“. O cenách se nezmiňuje. Pro produkci nespolehlivé.
- **Deep link** ve tvaru `https://www.bahn.de/buchung/fahrplan/suche#sts=true&so=Praha hl.n.&zo=Wien Hbf&soid=…&zoid=…&hd=2026-10-06T08:00:00…` skončil v automatickém Chromu chybou „Fehler beim Zugriff 751“; u běžného uživatele může fungovat, ale **ověřit se mi to nepodařilo**.

## 5. ČD

- Vlastní Ticket API (`https://ticket-api.cd.cz/…`) existuje, ale je pro smluvní partnery: bez identifikace vrací `401 {"exceptionCode":4000,"exceptionMessage":"Nezadané ID partnera."}`.
- Odkaz `https://www.cd.cz/spojeni-a-jizdenka/?fromtext=Praha&totext=Wien&date=…` formulář **nepředvyplní**; dokumentovaný formát jsem nenašel.
- **Funguje IDOS** (ověřeno, předvyplní a rovnou hledá vlaky i busy, u výsledků ukazuje ceny ČD):
  `https://idos.cz/vlakyautobusy/spojeni/?f=Praha&t=Wien&date=6.10.2026&time=8:00&submit=true`
  ATLAS tenhle typ odkazu už používá u „Vlakem tam, na kole zpět“.

## 6. Trainline, Omio, Google

- **Trainline:** `https://www.thetrainline.com/en/train-times/prague-to-vienna` se otevře (stránka trasy, „from €12.90“), datum předat nejde. Hledací API jsem nezkoušel; je za ochranou a oficiálně jen pro partnery.
- **Omio:** `https://www.omio.com/trains/prague/vienna` se otevře (stránka trasy s formulářem), datum v adrese není. API jen pro partnery; nezkoušel jsem.
- **Google Maps:** `https://www.google.com/maps/dir/?api=1&origin=Praha&destination=Vídeň&travelmode=transit` – oficiální formát „Maps URLs“, bez klíče, `travelmode=transit` je povolený, datum ani čas odjezdu předat nejde. Otevřelo se s aktuálními spoji (FlixBus 17:45–21:45, vlak 17:37–21:49).

## Doporučení pro ATLAS

1. **Hned a bez rizika: odhad + odkazy.**
   - Čas odhadnout z tabulky pro hlavní města (viz výše) a pro ostatní ze vzdálenosti: nejrychlejší spoje vycházejí na ~60–70 km/h vzdušnou čarou u tras do 450 km (Vídeň 58, Berlín 67, Mnichov 67, Krakov 68, Budapešť 72 km/h) a ~45–70 km/h u delších (Benátky 45, Curych 55, Amsterdam 58, Paříž 69 km/h). Vzdálenosti v tabulce jsou přibližné.
   - Cenu uvádět jako „od ~X Kč“ z téže tabulky a jasně jako orientační.
   - Odkazy: RegioJet a FlixBus s městy i datem, IDOS s datem, Google Maps bez data. Všechny čtyři jsou ověřené.
2. **Skutečné ceny a časy z RegioJetu** jsou technicky nejjednodušší (jeden dotaz ze serveru, čistý JSON, vlaky i busy, 15 zemí) – ale až po souhlasu RegioJetu, protože podmínky rozhraní nejsou veřejné.
3. **FlixBus** má nejširší pokrytí (všech 9 měst), ale podmínky komerční automatické využití bez smlouvy zakazují. Buď partnerská dohoda, nebo jen odkaz.
4. **ÖBB, DB, ČD, Trainline, Omio** jako zdroj dat nedoporučuji: ochrana proti botům, nestabilita, nebo jen pro partnery. Vhodné jsou jen odkazy (IDOS pokryje ČD i mezinárodní vlaky).
5. Kde letadlo nedává smysl (do ~450 km: Vídeň, Berlín, Mnichov, Budapešť, Krakov), stojí za to ukázat pozemní variantu vedle letů; u Paříže, Amsterdamu a Benátek je vlak či bus 12 hodin a víc.

## Co jsem neověřil

- Chování rozhraní z datacentrové adresy (Render) a jejich limity počtu dotazů.
- Přesné znění podmínek RegioJetu a FlixBusu (FlixBus jen z výsledku vyhledávání).
- Deep linky ÖBB a DB (zastavila je ochrana proti botům).
- Hledací API Trainline a Omio.
