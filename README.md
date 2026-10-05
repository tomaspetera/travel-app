# ATLAS – nejlevnější letenky odkudkoliv kamkoliv

Cestovní aplikace, která **skutečně hledá letenky**: napíšeš „Brno“, „Vídeň“, „Česko“, „Jihlava“ nebo použiješ polohu,
ATLAS najde všechna letiště v okolí, prohledá je najednou u více aerolinek a ukáže nejlevnější lety **kamkoliv na světě**
(nebo do konkrétního cíle) – včetně ceny cesty na letiště.

Z vybraného letu pak průvodce **Cesta** poskládá celou dovolenou: **let → ubytování → auto → program → shrnutí**
s celkovou cenou, seznamem, co v jakém pořadí zarezervovat, a časovou osou. Sekce **Objevuj** funguje i samostatně:
zadáš místo a ATLAS najde, co tam stojí za vidění, a rozplánuje to do dnů – jako pěší program ve městě,
**jednodenní výlety** autem (ráno ven, večer zpět) nebo **vícedenní okruh** s přespáním po cestě. Mapa je zdarma
a bez klíče (MapLibre + OpenFreeMap, záloha OpenStreetMap) a odkazy do Google Map hledají místo podle názvu.

K tomu zůstalo vše z původního ATLAS: mapa navštívených zemí, přehled zemí s počasím a bezpečností, doporučení
podle měsíce a plánovač cest.

## Celá cesta krok za krokem

1. **Let** – v hledání klikneš u letu na *Vybrat a pokračovat*. Tlačítkem *Ověřit živou cenu* se dotáže Kiwi.com
   na přesnou cenu a nabídne i jiné aerolinky na stejný termín (low-cost i klasické, přestupy, kombinace).
2. **Ubytování** – nabídky na tvoje data seřazené podle **nejlepšího poměru cena / hodnocení** (hodnocení je očištěné
   o malý počet recenzí, takže 10/10 ze 2 recenzí nepřebije 8,9 z 2 000). Přepneš na nejlevnější, nejlépe hodnocené
   nebo nejblíž centru, filtruješ 7+/8+/9+, typ a max. cenu za noc. Bez klíče LiteAPI dostaneš předvyplněné hledání
   na Booking.com (seřazené podle hodnocení a ceny), Airbnb, Google Hotels a Hostelworld a cenu jen zapíšeš.
3. **Auto** (nepovinné) – vyzvednutí na letišti 45 min po příletu, vrácení 2 h před odletem, předvyplněné srovnávače.
4. **Program** – místa k vidění kolem ubytování rozdělená do dnů podle polohy (den příletu a odletu je kratší),
   každý den jako pěší trasa s odkazem do Google Map; volíš zájmy a tempo, místa můžeš vyřadit nebo přidat.
5. **Shrnutí** – cena celkem a na osobu, co zarezervovat a v jakém pořadí, časová osa, uložení do plánovače a odkaz
   na sdílení.

### Je to umělá inteligence?

Ne. Ceny letenek jsou **skutečné odpovědi API aerolinek a vyhledávačů** (Ryanair, Wizz Air, Kiwi.com, Aviasales).
Nejlevnější kombinace, pořadí hotelů i program dnů počítají **deterministické algoritmy** (optimalizátor kombinací,
bayesovské hodnocení, shlukování míst k-means + trasa nejbližší soused / 2-opt). Místa k vidění a jejich popisy jsou
z Wikidat a Wikipedie. Stejný dotaz tedy dá stejný výsledek a nic si nevymýšlí.

## V čem je lepší než Skyscanner

| | ATLAS |
|---|---|
| **Odlet odkudkoliv** | Zadáš město, obec, zemi nebo polohu → prohledá *všechna* letiště v okruhu (např. z Jihlavy PED, BRQ, PRG, VIE, BTS, LNZ…). Letiště lze ručně vyřadit. |
| **Cena včetně cesty na letiště** | Ke každé letence přičte odhad dopravy na letiště (vzdálenost × Kč/km, nastavitelné). Let z Vídně za 600 Kč tak férově porovná s letem z Brna za 900 Kč. |
| **Kamkoliv z více letišť** | Jedno hledání = všechny destinace ze všech letišť v okolí, seskupené podle města (Londýn = STN + LTN + LGW…). |
| **Kombinace, které jinde nenajdeš** | Tam s Ryanairem, zpět s Wizz Air. Odlet z Vídně, návrat do Bratislavy. Přílet do Bergama, odlet z Malpensy. Optimalizátor skládá i takové cesty. |
| **Kalendář celých cest** | V režimu konkrétního cíle ukáže pro každý den nejlevnější *celou cestu tam a zpět* (se zadaným počtem nocí), ne jen jednosměrný let. |
| **Přesná data i flexibilně** | *📅 Přesná data*: zadáš den odletu a návratu a hledá se jen v tyto dny (volitelně ±1–3 dny). *🔀 Flexibilně*: rozsah dat odletu + počet nocí, víkendy (čt/pá/so → ne/po), prodloužené víkendy, vlastní dny v týdnu. |
| **Skóre výhodnosti** | 🔥 Super cena / 👍 Výhodné podle vzdálenosti a ostatních výsledků, ↓ zlevnění (Ryanair posílá předchozí cenu), ☀️ ideální sezóna z dat ATLAS. |
| **Mapa výsledků** | Všechny destinace na mapě obarvené podle ceny. |
| **Hlídání cen + živý radar** | Ulož hledání ♡ a na přehledu jedním klikem zjistíš, jestli cena klesla. Radar ukazuje nejlevnější lety z tvého okolí na příštích 6 týdnů. |

## Odkud bere ceny

| Zdroj | Co dává | Klíč |
|---|---|---|
| **Ryanair** (Fare Finder API webu ryanair.com) | živé ceny, „kamkoliv“ jedním dotazem na letiště, ceny po dnech | není potřeba |
| **Wizz Air** (API webu wizzair.com – mapa tras + `timetableV2`) | živé ceny po dnech na trasách | není potřeba |
| **Kiwi.com** (veřejný MCP server `mcp.kiwi.com`) | živé ceny všech aerolinek (low-cost i klasické, přestupy, kombinace různých aerolinek) pro konkrétní trasu – v hledání do cíle a při ověření vybraného letu | není potřeba |
| **Travelpayouts / Aviasales Data API** | všechny ostatní aerolinky (i s přestupy, dálkové lety), ceny z vyhledávání uživatelů za posledních ~48 h | **zdarma** token z [travelpayouts.com](https://www.travelpayouts.com/) |
| **LiteAPI** (ubytování) | hotely s cenou na zadané dny, hodnocením hostů a fotkou | **zdarma** klíč z [liteapi.travel](https://www.liteapi.travel/) |
| **Wikidata + Wikipedie** (program) | místa k vidění, typ, význam, fotky, české popisy | není potřeba |

> Amadeus Self-Service API bylo v červenci 2026 vypnuto a Kiwi Tequila ani Skyscanner API nepřijímají nové vývojáře
> (Kiwi.com je proto napojené přes svůj veřejný MCP server; jeho podmínky pro neagentní použití nejsou zveřejněné –
> kdyby ho Kiwi omezilo, vypne se `KIWI_ENABLED=0` a zbytek běží dál),
> proto ATLAS staví na zdrojích výše. Adaptéry jsou oddělené (`server/providers/`), další zdroj se přidá jedním souborem.

Ceny Ryanair a Wizz Air jsou živé, ale do rezervace se mohou změnit; ceny z Travelpayouts jsou označené „⏱ z cache“
a je dobré je ověřit (u každého výsledku je odkaz na rezervaci a na ověření v Google Flights / Skyscanneru).

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
| `SEARCH_RATE_LIMIT` | `40` | max. hledání z jedné IP za 10 minut (ochrana při veřejném nasazení, `0` = bez limitu) |
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
| `GET /api/poi?lat=…&lon=…&radius=8` | místa k vidění (Wikidata + Wikipedie) |
| `POST /api/roadtrip` | výlety autem z místa: `mode` `day` (jednodenní) nebo `loop` (okruh s přespáním), `lat`, `lon`, `label`, `start`, `days`, `pace`, `exclude`, `include` |
| `POST /api/itinerary` | rozplánování míst do dnů (`lat`, `lon`, `start`, `end`, `arrivalTime`, `departureTime`, `pace`, `interests`, `exclude`, `include`) |
| `GET /api/diag` | živý test, jestli server dosáhne na jednotlivé zdroje |

Přesná data: místo `dateFrom`/`dateTo` + nocí pošli `"exactOut": "2026-11-14", "exactBack": "2026-11-21"` (a volitelně
`"flexDays": 1` = každé datum ±1 den); u `"trip": "oneway"` stačí `exactOut`.

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
- Ceny jsou základní tarif bez zavazadel a příplatků.
- Kombinace dvou aerolinek / různých letišť jsou **dvě samostatné letenky** – při zpoždění prvního letu druhá aerolinka
  nečeká. Aplikace to u výsledku označí.
- Odhad dopravy na letiště je orientační.
- Podmínky Ryanairu zakazují automatické stahování dat pro komerční účely – aplikace je určená pro osobní použití.
  Pro komerční provoz je potřeba smluvní zdroj dat (např. Travelpayouts / Aviasales jako affiliate partner).
- Render může pozastavit bezplatnou službu, která volá externí API v neobvykle velkém objemu; proto má server
  limit hledání na IP (`SEARCH_RATE_LIMIT`) a strop dotazů na Wizz Air (`WIZZ_MAX_CALLS`).

## Data a licence

- Letiště: [OurAirports](https://ourairports.com/data/) (public domain) + názvy měst a časová pásma z
  [OpenFlights](https://openflights.org/data) (ODbL). Aktualizace: `npm run build:airports`.
- Geokódování a počasí: [Open-Meteo](https://open-meteo.com/). Kurzy: open.er-api.com, ECB.
- Mapa světa: d3, topojson-client, world-atlas (ISC, přibaleno v `public/vendor/`).
- Mapy míst: MapLibre GL JS (BSD-3-Clause, přibaleno v `public/vendor/maplibre/`), podklad OpenFreeMap
  (© OpenMapTiles, data © přispěvatelé OpenStreetMap, ODbL), záloha dlaždice OpenStreetMap.
- Původní jednosouborová verze aplikace je pro srovnání v `legacy/ATLAS-puvodni.html`.
