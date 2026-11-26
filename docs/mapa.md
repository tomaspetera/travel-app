# Mapa kódu ATLAS

Navigační mapa repozitáře: kde co je a jak to spolu souvisí, aby se kód dal najít bez dlouhého hledání.

## Jak mapu používat
- Osnova: `grep -n '^## ' docs/mapa.md`, pak čti jen potřebný oddíl (`sed -n 'OD,DOp' docs/mapa.md`); úkol nebo soubor: `grep -n 'slovo' docs/mapa.md`.
- Funkce jsou psané jako `název()` bez čísel řádků – v souboru je najdeš přes `grep -n 'název' soubor`.
- Funkce aplikace, zdroje dat, proměnné prostředí a licence popisuje `README.md` (osnova `grep -n '^##' README.md`); tady jsou jen odkazy na jeho oddíly.
- Úplnost hlídá `test/mapa.test.js`: každý soubor v `server/` (vč. lib/ a providers/), `public/js/`, `public/css/`, `scripts/`, `data/` a každá routa ze `server/index.js` musí být tady. Přidáš soubor nebo endpoint → přidej řádek sem.

## Kde co najdu

### Lety a hledání
- Formulář Letů a co jde na `/api/search` → `public/js/flights.js`: `defaultForm()`, `getForm()`, `setForm()`, `payloadOf()`, `groundPayload()`, `paxPayload()`
- Spuštění hledání, NDJSON stream, průběh → `public/js/flights.js`: `startSearch()`, `runSearch()`, `renderProgress()`, `showPartial()`
- Kontrola dotazu a české chyby (400) → `server/lib/search.js`: `normalizeQuery()`, `sharedQuery()`, `paxQuery()`, `UserError`
- Hledání na serveru: konkrétní cíl / Kamkoliv → `server/lib/search.js`: `search()`, `routeProvider()`, `exploreProvider()`, `exploreFrom()`, `kiwiExplore()`
- Které země prohledat, přestupní letiště (VIE, MUC…) → `server/lib/search.js`: `pickTargets()`, `warmTargets()`; `server/lib/longhaul.js`: `LONG_HAUL_SWEEP`, `WARM_SWEEP`, `CONTINENTS`, `hubsNear()`
- Kombinace aerolinek a letišť v Kamkoliv → `server/lib/search.js`: `mixAdd()`, `mixPrune()`, `mixFlush()`, `mixTrips()`, `mixAll()`
- Skládání zpátečních cest, kalendář, mřížka → `server/lib/optimizer.js`: `bestRoundTrips()`, `bestOneWays()`, `legsPerDay()`, `oneWayCalendar()`, `gridArray()`; `server/lib/search.js`: `cellRows()`
- Ocenění nabídky (perPersonCzk, tripCzk, totalCzk), skupiny cílů → `server/lib/search.js`: `buildGroups()`, `dealOf()`, `topWithDays()`, `originBests()`
- Cesta přes víc měst → `server/lib/search.js`: `normalizeMulti()`, `searchMulti()`; `server/lib/multi.js`: `legFits()`, `pickOptions()`, `buildCombos()`
- Zdroje cen: zapnutí a stav v `/api/health` → `server/providers/index.js`: `activeProviders()`, `providerStatus()`, `PROVIDER_INFO`
- Rozpočet dotazů a paměť tras Wizz Air → `server/lib/search.js`: `planRoutes()`, `routesNote()`; `server/providers/wizzair.js`: `routeState()`, `timetable()`, `missingWindows()`
- Výpadek zdroje, Zkusit znovu, odpočet → `server/lib/search.js`: `settle()`, `outageOf()`, `errText()`; `server/providers/kiwi.js`: `kiwiBlocked()`
- Průběžné náhledy a zmenšený radar → `server/lib/search.js`: `partialSoon()`, `partialNow()`, `compose()`, `radarResult()`, `RADAR_TRIP`
- Tvar letu a cesty, převod měn, zavazadla → `server/lib/fares.js`: `makeLeg()`, `makeTrip()`; `server/lib/fx.js`: `loadRates()`, `toCzk()`; `server/lib/baggage.js`: `legBagEur()`
- Je to dobrá cena? (zrcadlo server ↔ prohlížeč) → `server/lib/pricelevel.js`: `priceLevelOf()`, `levelOf()`; `public/js/pricecheck.js`: `levelOf()`, `assess()`, `remember()`, `explain()`
- Výpis výsledků, filtry, řazení, karta nabídky, kliky (data-*) → `public/js/flights.js`: `renderResults()`, `computeGroups()`, `baseOk()`, `sortKey()`, `tripRow()`, `priceBox()`, `wireResults()`
- Filtry času a přestupů, čipy filtrů → `public/js/searchhelp.js`: `timeOk()`, `timeChips()`, `timeHidden()`, `activeFilters()`; `public/js/flights.js`: `timePanel()`
- Přesná data a kalendář cen v prohlížeči → `public/js/flights.js`: `legsView()`, `calendarHtml()`, `gridHtml()`; `public/js/searchhelp.js`: `distinctLegs()`, `composeTrip()`, `gridTrips()`, `dayCal()`
- Doporučené pořadí a štítek „proč výš“ → `public/js/rank.js`: `score()`, `order()`, `reasons()`, `W`
- ✨ Hledání větou → `public/js/smart.js`: `parse()`, `rule()`, `seaFor()`; `public/js/flights.js`: `smartResolve()`, `smartRun()`, `smartTips()`
- ♡ Hlídání cen a jeho kontrola → `public/js/flights.js`: `addWatch()`, `checkOne()`, `startAutoCheck()`, `renderWatch()`; `public/js/alerts.js`: `scheduler()`, `applyCheck()`, `shouldNotify()`
- Radar na Přehledu → `public/js/flights.js`: `renderRadar()`, `radarSearch()`, `paintRadar()`; `public/js/searchhelp.js`: `radarQuery()`, `radarPick()`, `radarEntry()`
- ⭐ Moje cíle, 🙈 Nezajímá mě, 📌 Odložené → `public/js/flights.js`: `destMenu()`, `searchFavs()`, `openPins()`; `public/js/searchhelp.js`: `destPrefSet()`; `public/js/pins.js`: `toggle()`, `refresh()`, `rank()`
- ⚡ Živé ověření ceny → `public/js/flights.js`: `verifyOne()`, `autoVerify()`; `server/providers/kiwi.js`: `kiwi.exact()`
- Odkazy na rezervaci → `server/providers/ryanair.js`, `server/providers/wizzair.js`, `server/providers/travelpayouts.js`: `bookingUrl()`; `server/lib/search.js`: `roundTripUrl()`
- Cestující, svátky, Kdy si vzít dovolenou → `public/js/searchhelp.js`: `paxOf()`, `holidayList()`, `longWeekends()`, `leaveWindows()`; `public/js/flights.js`: `paxSheet()`, `openLeavePlan()`
- Obnova výsledků, koncept formuláře, nedávná hledání → `public/js/flights.js`: `saveLast()`, `restoreLast()`, `draftStart()`, `renderRecent()`; `public/js/searchhelp.js`: `lastLoad()`, `draftLoad()`, `recentAdd()`

### Místa, našeptávač a Objevuj
- Našeptávač Odkud/Kam na serveru, pořadí návrhů (město × letiště podle role, vzdálenost od domova) → `server/lib/places.js`: `suggest()`, `localScored()` (skóre shody), `rank()` (výběr a pořadí), `homePoint()`
- Našeptávač v prohlížeči → `public/js/flights.js`: `class PlaceInput`, `placesFor()`, `placeCtx()`
- Načtení a geokódování `data/places.json` → `server/lib/places.js`: `loadPlaces()`, `geocode()`, `geocodePlaces()`, `englishName()`
- Hledání místa v Objevuj (Mapy.com, oblasti, příroda) → `server/lib/places.js`: `geocodeExplore()`, `regionPlace()`, `regionSub()`, `townBeforeRegion()` (obec před oblastí), `natureMatches()` (překlep `natureTypos()`), `withNature()`, `sameOnce()`
- ID místa → štítek; výběr → letiště → `server/lib/places.js`: `describe()`, `resolveOrigins()`, `resolveDestinations()`, `cityAirports()`
- České a cizí názvy, metropole, regiony, hory → `server/lib/names.js`: `EXONYMS`, `CITY_CS`, `AIRPORT_CITY_CS`, `METROS`, `REGIONS`, `NATURE`, `COUNTRY_ALIASES`
- Letiště, klíč cíle, země podle polohy → `server/lib/airports.js`: `getAirport()`, `airportsNear()`, `destKey()`, `countryAt()`, `sizePenaltyKm()`
- Místa kolem bodu z Wikidat → `server/lib/poi.js`: `findPlaces()`, `wdqs()`, `groupBindings()`, `scorePlace()`, `enrich()`
- Výlety do ~120 km, klasiky, Go next → `server/lib/poi.js`: `findTrips()`, `tripsFromRows()`; `server/lib/daytrips.js`: `rankTrips()`, `reachOf()`, `CLASSICS`, `parseGoNext()`
- Celá země 🌍 a „Co hledáš?“ → `server/lib/poi.js`: `countryHighlights()`, `countryCategory()`; `public/js/places.js`: `openWholeCountry()`, `loadCountry()`, `loadCountryCat()`
- Objevuj v prohlížeči: hledání, seznam, mapa → `public/js/places.js`: `renderExplore()`, `wireExploreSearch()`, `openPlace()`, `loadExplore()`, `paintExplore()`
- ✨ Věta v Objevuj → `public/js/smart.js`: `parseExplore()`, `nominatives()`; `public/js/places.js`: `smartPlace()`
- Mapa MapLibre a turistická vrstva Mapy.com → `public/js/places.js`: `loadMapLib()`, `makeMap()`, `drawOnMap()`, `setOutdoor()`, `mapyTiles()`
- Mapy.com: kredity, pojistka, dlaždice, návrhy → `server/lib/mapy.js`: `mapyOn()`, `mapyReady()`, `charge()`, `gate()`, `mapyTile()`, `mapySuggest()`
- Limit Objevuj podle mezipaměti → `server/index.js`: `exploreLimited()`, `exploreCharge()`; `server/lib/poi.js`: `placesCached()`, `tripsCached()`, `countryCached()`
- Okruh jen uvnitř oblasti → `server/lib/regions.js`: `keepInRegion()`, `inRegion()`, `hasRegion()`
- Uložit výsledek Objevuj do Mých cest → `public/js/places.js`: `plannerEntry()`, `findTripFor()`, `mergeInto()`
- 🔎 Co tam je (náhled cíle) → `public/js/flights.js`: `openDestPreview()`, `dpShow()`; `public/js/places.js`: `preview()`, `openAt()`
- Mapa světa, navštívené země, mřížka zemí → `public/js/app.js`: `initMap()`, `paintMap()`, `setVisited()`, `renderCountries()`

### Cesta a plánování
- Start průvodce z letu, kroky → `public/js/trip.js`: `start()`, `render()`, `setStep()`, `stepTo()`, `STEPS`
- ✈️ Letenku už mám (průvodce bez hledání, vlastní let `flight.own`, ruční cena `manual`) → `public/js/trip.js`: `haveTicket()`, `ownFlightTrip()`, `fullPlace()`; tlačítko `#heroOwn` v `public/index.html`, obsluha v `public/js/app.js` `renderDash()`
- „Koupeno?“ po návratu od prodejce, počítadla klepnutí u nabídky → `public/js/flights.js`: `offerClick()`, `offerKind()`, `boughtShow()`, `seenOnce()`
- Trasa přes víc míst v průvodci → `public/js/trip.js`: `routeStep()`, `suggestRoute()`, `routeEditor()`, `addBase()`, `refreshTransfers()`
- Návrh trasy, noci, cena přejezdu → `server/lib/stayplan.js`: `planStay()`, `suggestRoute()`, `evaluateRoute()`, `splitNights()`, `transfer()`, `tollCzk()`
- Čas přejezdu, trasa autem z BRouteru → `server/lib/transfers.js`: `transferTimes()`, `routeTransfers()`, `driveRoute()`, `railLink()`; `server/lib/brouter.js`: `brouterGet()`
- Program ve městě po dnech → `server/lib/itinerary.js`: `planItinerary()`, `dayCapacities()`, `clusterDays()`, `orderRoute()`, `dayTimeline()`, `addTips()`
- Zavírací dny památek → `server/lib/hours.js`: `sightHours()`, `closedOn()`, `closedWhy()`, `hoursNote()`; `server/lib/itinerary.js`: `closedFix()`
- Program v kroku Program i v Objevuj → `public/js/places.js`: `renderPlanner()`, `makePlan()`, `dropUndo()`; `public/js/trip.js`: `programStep()`, `progOpts()`
- Túry na víc dní → `server/lib/hikeplan.js`: `planHikes()`, `natureAreaAt()`, `pickGoals()`, `pickStart()`, `foodAlong()`; `public/js/places.js`: `makeHikePlan()`
- Kolo a pěšky (okruh, vlakem tam) → `server/lib/bike.js`: `bikeLoop()`, `hikeLoop()`, `bikeFromStation()`, `trailheadsNear()`, `parseRoute()`
- Výlety z místa (den / okruh) → `server/lib/roadtrip.js`: `planTrips()`, `bestDayLoop()`, `planLoop()`, `splitDays()`; `public/js/places.js`: `makeTrip()`
- ⚡ Poskládej celou cestu za mě → `public/js/trip.js`: `autoTrip()`, `autoStay()`, `autoPrograms()`, `autoPlan()`; bez cen hotelů na serveru `noPriceCand()`
- Shrnutí, cena, rozpočet, průběh cesty → `public/js/trip.js`: `summaryStep()`, `costs()`, `budgetHtml()`, `timeline()`, `leaveBy()`; průběh po dnech `tlDays()`, `tlHtml()`; chybějící ubytování v součtu `stayGap()`, `totalLbl()`; tisk `printNote()` a `@media print` v `public/css/trip.css`
- Průvodce v čistém režimu (co server podle `/api/health` umí) → `public/js/trip.js`: `healthSoon()`, `liveOn()`, `stayPricesOn()`, `flightCached()`; ✓ v liště kroků `stepDone()`
- Co zařídit a co sbalit → `public/js/pretrip.js`: `html()`, `contextOf()`, `todos()`, `pack()`, `setDone()`, `reminders()`
- Vstupní podmínky → `public/js/entry.js`: `cardChip()`, `flightChip()`, `detailHtml()`, `checklistHtml()`, `transitHtml()`
- Moje cesty a průvodce ↔ Moje cesty → `public/js/app.js`: `myTrips()`, `openTrip()`, `newTrip()`, `editTrip()`; `public/js/trip.js`: `saveToPlanner()`, `autoSave()`, `openSaved()`
- Export do kalendáře → `public/js/trip.js`: `calendarEvents()`; `public/js/ics.js`: `build()`, `download()`, `gcalUrl()`, `checkinEvent()`; `public/js/app.js`: `icsDownload()`
- 📍 Dnes na cestě → `public/js/app.js`: `renderNow()`, `tripNow()`, `nowCard()`, `nowWxFetch()`

### Ubytování
- Hledání ubytování (celý tok) → `server/lib/stays.js`: `searchStays()`, `normalizeStayQuery()`, `rankStays()`, `adjustedRating()`
- Který zdroj cen hotelů → `server/providers/stays/index.js`: `stayProviders()`, `liteapiLive()`, `liteapiTestKey()`
- Xotelo/TripAdvisor: místo, ceny, hotely z okolí → `server/providers/stays/xotelo.js`: `searchXotelo()`, `locationKeys()`, `seedCity()`, `hotelRates()`, `nearbyPool()`; data `server/providers/stays/ta-places.js`: `TA_PLACES`
- Ověření volna při „Vybrat“ → `public/js/trip.js`: `checkStay()`; `server/lib/stays.js`: `checkStay()`; `server/providers/stays/xotelo.js`: `checkHotel()`
- Ubytování bez ceny z OpenStreetMap → `server/providers/stays/osm.js`: `osmLodging()`, `mapOsm()`, `rankOsm()`
- LiteAPI a demo hotely → `server/providers/stays/liteapi.js`: `liteapi`, `mapHotels()`; `server/providers/stays/demo.js`: `demoStays`
- Odkazy na partnery a affiliate → `server/lib/links.js`: `stayLinks()`, `affiliate()`, `affiliateOn()`, `googleHotelsTs()`
- ID místa u Trip.com, Agody, Hostelworldu → `server/lib/partnerids.js`: `partnerLookups()`, `partnerIds()`, `tripCityId()`, `agodaCityId()`
- Krok Ubytování v průvodci → `public/js/trip.js`: `stayStep()`, `loadStays()`, `renderStays()`, `stayCard()`, `autoPickStays()`

### Doprava na letiště a po zemi
- Cesta na letiště (MHD, auto, parkování) → `server/lib/access.js`: `airportAccess()`, `transitAccess()`, `carAccess()`, `carTrip()`, `parkCzk()`, `ACCESS`
- Totéž v prohlížeči (zrcadlo) → `public/js/searchhelp.js`: `carEnergy()`, `carTrip()`, `parkCzk()`, `ownClean()`, `CAR_FUELS`
- Náhled letišť pod Odkud, 🏠 vlastní cena → `public/js/flights.js`: `refreshOrigins()`, `renderOwn()`, `carInfo()`; `server/index.js`: `accessParams()`, `withTrip()`
- Z letiště do města → `server/lib/arrival.js`: `arrivalTransfer()`, `legArrivalCzk()`, `arrivalsFor()`, `estimateArrival()`
- Vlak/bus místo letadla (server) → `server/lib/ground.js`: `groundInfo()`, `estimate()`, `worth()`, `links()`, `regiojet()`, `attachGround()`
- Vlak/bus v prohlížeči a v průvodci → `public/js/ground.js`: `load()`, `panel()`, `worth()`; `public/js/flights.js`: `groundBanner()`; `public/js/trip.js`: `overlandPicker()`, `setOverland()`
- Ceny paliva a nabíjení → `server/lib/fuel.js`: `refreshFuel()`, `fuelPrice()`, `carFuelCzk()`, `fuelInfo()`, `EV_DC`
- Půjčení auta → `server/lib/cars.js`: `searchCars()`, `normalizeCarQuery()`; `server/lib/links.js`: `carLinks()`; `public/js/trip.js`: `carStep()`

### Počasí, klima, fotky
- Předpověď MET Norway na serveru → `server/lib/weather.js`: `weatherAt()`, `parsePts()`, `daysFrom()`, `nowFrom()`, `tzAt()`
- Počasí v prohlížeči, západ slunce, sloty v plánu → `public/js/weather.js`: `forecast()`, `span()`, `badge()`, `normal()`, `sunsets()`; `public/js/places.js`: `fillWx()`, `fillSun()`
- Ikona a text podle kódu počasí (karta 📍 Dnes na cestě, okno země, štítky) → `public/js/data.js`: `WC`, `wIco()` (`public/js/weather.js` je bere přes `wi()`); karta Dnes na cestě: `public/js/app.js` `nowCard()` → `Weather.badge()`; počasí u nabídek Letů: `public/js/flights.js` → `Weather.span()`, `Weather.trip()`
- Dlouhodobé podnebí, „za teplem“ → `server/lib/climate.js`: `climateAt()`, `airportClimate()`, `countryClimate()`, `seasonMonth()`, `warmAirports()`
- Fotky měst, autor a licence z Commons → `server/lib/photos.js`: `cityPhotos()`, `pickPhotos()`, `photoScore()`, `commonsCredit()`, `photosCached()`; `public/js/app.js`: `Photos.paint()`
- Doporučení „Kam vyrazit“ podle měsíce (body a pořadí) → `public/js/recs.js`: `rank()`, `W` (váhy), `profile()`, `defaultMonth()`; `public/js/app.js`: `recsFor()`, `renderRecs()`, `seasonOf()`
- Okno země (počasí, kurzy přes `/api/fx`, podnebí) → `public/js/app.js`: `openCountry()`, `loadWeather()`, `loadFx()`, `loadClimate()`

### Sdílení, záloha, PWA
- Kódování odkazů za # a krátký odkaz → `public/js/sharelink.js`: `pack()`, `unpack()`, `prepare()`, `short()`, `send()`
- Krátké odkazy a pozvánky na serveru → `server/lib/shortlinks.js`: `createShare()`, `loadShare()`, `sharePage()`, `inviteMeta()`, `invitePage()`
- Sdílení cesty `#trip=` a import → `public/js/trip.js`: `linkJson()`, `share()`, `importFromHash()`, `sanitizeTrip()`
- Plán `#plan=` a sloučení verzí → `public/js/planshare.js`: `json()`, `sanitize()`, `merge()`; `public/js/app.js`: `sharePlan()`, `previewPlan()`
- Nabídka `#offer=` → `public/js/offershare.js`: `sanitize()`, `json()`, `text()`, `SHOPS`; `public/js/flights.js`: `offerShare()`, `openOffer()`
- „Jede někdo se mnou?“ (karty, `#jed=`) → `public/js/sharecard.js`: `open()`, `render()`, `landing()`, `pathUrl()`
- Odkazy v adrese při startu → `public/js/app.js`: `shortFromHash()`, `importPlanFromHash()`, `openOfferFromHash()`, `openJedFromHash()`, `openWatchFromHash()`
- 💾 Záloha do souboru → `public/js/backup.js`: `pack()`, `parse()`, `merge()`, `preview()`, `apply()`, `restore()`
- 📲 Přenos do jiného zařízení → `public/js/transfer.js`: `open()`, `fromHash()`, `receive()`; `public/js/qr.js`: `encode()`, `svg()`
- Service worker, offline: co obsluhuje (`route()`: API, /c/, /j/ ne), kdy ukládá (`networkFirst()`, `remember()`) → `public/sw.js`; co předem uloží (PRECACHE = `shellAssets()` ze stránky + `RUNTIME_ASSETS` + `cssAssets()` = písma a obrázky z url() ve stylech), BUILD a otisky souborů → `server/lib/pwa.js`: `serviceWorker()`, `contentVersion()`
- Nová verze, offline pruh, instalace, české chyby sítě → `public/js/pwa.js`: `checkVersion()`, `install()`, `httpError()`, `netError()`, `whenOnline()`
- Odložené moduly a knihovny map → `public/js/lazy.js`: `need()`, `run()`, `soon()`, `url()`
- Navigace, Zpět, okno, hlášky, stav S, motiv → `public/js/app.js`: `go()`, `buildNav()`, `histPop()`, `histSub()` (krok uvnitř sekce: Zpět z 🔎 Prozkoumat na přehled země), `modalOpen()`, `modalClose()`, `toast()`, `save()`, `applyTheme()`
- ✨ Co je nového → `public/js/app.js`: `WHATS_NEW`, `WN_ID`, `whatsNewPop()`, `whatsNewOpen()`
- 🕘 Od minula → `public/js/since.js`: `gate()`, `digest()`; `public/js/app.js`: `renderSince()`, `sinceStart()`
- ℹ️ O aplikaci a soukromí → `public/js/about.js`: `open()`, `html()`, `SOURCES`

### Server, bezpečnost, nasazení
- Nový API endpoint → `server/index.js`: `route()` – nová větev `if (p === '/api/…')` před catch-all 404
- Nový limit na IP → `server/index.js`: `new RateLimiter()` + `rateLimited()`; hodnota do `server/config.js`: `config`
- Nová proměnná prostředí → `server/config.js`: `config` (+ seznam klíčů v komentáři `render.yaml`, README ### Nastavení); vypínač zdroje letů = podmínka v `server/providers/index.js` `activeProviders()` (+ `providerStatus()`), hotelů v `server/providers/stays/index.js` `stayProviders()`
- Fronta, souběh, hotové výsledky hledání → `server/index.js`: `handleSearch()`, `searchGate`, `_searchClients`, `_recentSearches`, `revalidate()`; `server/lib/crowd.js`: `sharedRuns()`, `gate()`, `breathe()`
- Co vrací `/api/health` a `/api/diag`, předehřátí → `server/index.js`: `searchStats()`, `diagnose()`, `warmUp()`
- Volání cizího API, text chyb 503 → `server/lib/http.js`: `request()`, `limiter()`, `CookieJar`, `HttpError`, `publicMessage()`; `server/index.js`: `createServer()`
- Mezipaměť → `server/lib/cache.js`: `cache.wrap()`, `TTLCache`, `checkMemory()`, `stats()`
- Limit požadavků a mazání IP → `server/lib/ratelimit.js`: `RateLimiter`, `hit()`, `sweep()`, `prune()`
- Hlavičky, CSP, nový cizí host pro fetch → `server/lib/security.js`: `SECURITY_HEADERS`, `API_CSP`, `pageCsp()`, `CONNECT`
- IP klienta, blokace cizích webů (403) → `server/lib/security.js`: `clientIp()`, `ipKey()`, `crossSite()`
- Statika, otisky ?v=, komprese → `server/index.js`: `serveFile()`, `versionOf()`, `packedBody()`, `sendJson()`; `server/lib/pwa.js`: `serveIndex()`, `versionAssets()`
- Titulek, OG, robots, sitemap, 404, manifest → `server/lib/seo.js`: `headTags()`, `robotsTxt()`, `sitemapXml()`, `serveNotFound()`, `serveManifest()`
- Stará adresa Renderu (`atlas-letenky.onrender.com`) → 301 na vlastní doménu `PUBLIC_URL` (jen stránky, ne API/soubory/`/healthz`/`sw.js`) → `server/lib/seo.js` `movedTo()`, zapojené na začátku `route()` v `server/index.js`
- Název aplikace, doména → `server/brand.js`: `BRAND`; `server/config.js`: `cleanSiteUrl()` (PUBLIC_URL)
- 💬 Napsat nám / 💛 Podpořit / provozovatel → `server/config.js`: `cleanEmail()`, `cleanPayUrl()`, `cleanOperator()`; `public/js/about.js`: `okEmail()`, `okPay()`
- Chyby z prohlížeče v logu Renderu → `public/js/errlog.js`: `report()`, `makeReport()`; `server/lib/clienterr.js`: `cleanReport()`, `recordClientError()`
- Souhrnné denní počty bez sledování lidí (co lidé v aplikaci dělají) → `public/js/count.js`: `hit()`, `view()`; `server/lib/counts.js`: `EVENTS`, `SERVER_EVENTS`, `makeCounter()`; zapojení `go()` a `boot()` v `public/js/app.js`; čtení GET `/api/stats` (za `STATS_KEY`, je-li nastavený)
- Pomáhat se zlepšováním (souhlas, jen kdo ho sám zapne): podrobné počty, opakované klepnutí `rage_*` a záznam průchodu návštěvou → `public/js/count.js`: `helping()`, `deep(název, onceKey)`, `consent()`, `rageTap()`; `server/lib/traces.js`: `cleanTrace()`, `makeTraces()`, `TRACE_EVENTS`; karta `helpCard()` a přepínač `helpSwitch()` / `helpBtn()` v `public/js/app.js` (openMore), přepínač i v `public/js/about.js`; POST `/api/trace`, čtení GET `/api/traces` (jen s `STATS_KEY`)
- Serverové počty „kde to drhne“ (hledání bez nabídek / nad limitem / plný server / chyba, ubytování bez nabídek, sdílený odkaz otevřený / nefunkční, chyba z prohlížeče) → `server/index.js`: `counter.hit(...)` v `handleSearch()`, `streamSearch()` + `searchEvent()`, `/api/stays`, `/api/share/<id>`, `/api/client-error`
- Krátké otázky na jedno klepnutí (odpovědi `mq_*`, zobrazení se nepočítá; nejvýš 1 za načtení stránky) → `public/js/count.js`: `ask()`; místa: `boughtShow()` a `emptyAsk()` v `public/js/flights.js` (cena u prodejce, prázdný výsledek), `restart()` a `summaryStep()` (`TRIP_ASK`) v `public/js/trip.js`, `exNotFound()` / `missNext()` v `public/js/places.js` (Objevuj bez výsledku); rozložení odpovědí `dist()` v `public/js/statistiky.js`; test `test/mikro-otazky.test.js`
- Podrobné počty v Letech (jen se zapnutou pomocí „Pomáhat se zlepšováním“, `Count.deep`) → `public/js/flights.js`: `fixHit()` + `wireHelp()` (`fix_*` jen u prázdného výsledku), `PlaceInput.fetch()` (`place_none_*`), `startSearch()` (`form_err_*`, `search_redo`, `search_slow`), `smartRun()` (`sentence_*`), `wireResults()` (`res_*`), `offerClick()` (`buy_rank_*`), `ageBuy()` (`buy_age_warn`); čisté funkce `fixKind()`, `formErrKind()`, `buyRank()`, `resEmpty()` v `public/js/searchhelp.js`; `api_fail_down` v obalu fetch v `public/js/pwa.js` (`every()`, 1× za minutu); na stránce `FL_SNAGS`, `FL_FIX`, `FL_RES`, `FL_RANK` v `public/js/statistiky.js`; test `test/hloubka-lety.test.js`
- Podrobné počty jen se souhlasem „Pomáhat se zlepšováním“ (`Count.deep`) v průvodci, Objevuj a načítání → `public/js/trip.js`: `stepEvent()`, `stepCount()` (v `setStep()`/`stepTo()`, ne v `autoGo()`), `RESTART_EV` (obsluha ↺, `restart()` vrací true po potvrzení), `STAY_PICK`/`stayPick()`, `trip_auto_*` v `autoTrip()`, `stay_empty_filter` v `renderStays()`, `trip_gap` v `summaryStep()`; `public/js/places.js`: `openOther()`, `exFix()`, `pick(s, how)`, `ex_empty_*` v `paintExplore()`; `public/js/lazy.js`: `lazy_fail` v `inject()`; stránka `public/js/statistiky.js`: `tripFunnel()`, `TRIP_MORE`, `EXPLORE`; testy `test/hloubka-pruvodce.test.js`
- Statistiky pro majitele (čitelný přehled `/api/stats` na telefonu) → `public/statistiky.html` + `public/js/statistiky.js`: `funnel()`, `rates()` (Kde to drhne), `survey()`, `median()`, `doors()`, `dayRows()`, `askKey()` (pole klíče při 401), `dist()` a `QUESTIONS` (odpovědi na krátké otázky), Cesty návštěv `exits()`, `lastSteps()`, `topPaths()`, `after()`, `visitStats()` (`loadTraces()`, `renderTraces()`), trychtýř průvodce `tripFunnel()` (`TRIP_FUNNEL`, `TRIP_MORE`, `EXPLORE`), Lety podrobně (`FL_SNAGS`, `FL_FIX`, `FL_RES`, `FL_RANK`)

## Tok dat
- **Start serveru**: `npm start` → `server/index.js` (listen jen jako vstupní skript) → `createServer()` → `server.listen(config.port, config.host)` → `warmUp()`: `loadRates()` → `loadPlaces()` → mimo DEMO `refreshFuel()` + sítě aerolinek → SIGTERM/SIGINT: `server.close()`, po 10 s exit.
- **Požadavek**: `SECURITY_HEADERS` → `route()` → u `/api/*`: `API_CSP` + `crossSite()` → 403 → větev routy (`rateLimited()` → 429 s Retry-After) → `sendJson()` / `serveFile()` / `sendGenerated()`; catch: `HttpError` → 503 česky, „Timeout N ms“ → 503, chyby se status 400 → jejich text, jinak 500.
- **Hledání letenek**: `startSearch()` → `runSearch()` POST `api/search` → `handleSearch()` (`searchKeys()`, hotový `_recentSearches` / starší `staleLine()`; plná fronta 503, moc na IP 429) → `streamSearch()` (ping wait po 20 s) → `sharedSearch()` → `search()`: `normalizeQuery()` → `resolveOrigins()` + `resolveDestinations()` → `settle()` pro `activeProviders()` (`routeProvider()` | `exploreProvider()`) → `compose(true)`: `bestRoundTrips()` → `buildGroups()` → `attachGround()` → `attachDepartures()` → `{type:'result'}` → `keepResult()` → `renderResults()`, `saveLast()`.
- **Našeptávač Odkud/Kam**: psaní (160 ms) → `PlaceInput.fetch()` → `Smart.parse()` nebo `placesFor()` GET `api/places` → `suggest()`: `homePoint()` → `localScored()` → při málo shodách `geocode()` (`data/places.json`) → `rank()` → `PlaceInput.open()` → `choose()` nebo `smartRun()`.
- **Objevuj**: `renderExplore()` → `wireExploreSearch()` (`fetchSugs()` → `api/geocode?mapy=1` → `geocodeExplore()`) → `openPlace()` → `loadExplore()` GET `api/poi` → `exploreLimited()` → `findPlaces()` (WDQS, `groupBindings()`, `rankTrips()`, `enrich()`) → `paintExplore()` → plán: `api/itinerary` | `api/roadtrip` | `api/bike` | `api/hike` | `api/hikeplan` → uložení `plannerEntry()` do S.trips.
- **Plán cesty**: `Trip.start()` → `flightStep()` (`api/verify`) → `routeStep()` (POST `api/stayplan` → `planStay()` → `findTowns()`, `routeTransfers()` → `brouterGet()`) → `stayStep()` → `carStep()` (`api/cars`) → `programStep()` → `Places.renderPlanner()` (`api/nature` → `planItinerary()` | `planHikes()`) → `summaryStep()` (`PreTrip.html()`, `calendarEvents()`) → `autoSave()` → S.trips.
- **Ubytování**: `loadStays()` GET `api/stays` → `searchStays()` → `normalizeStayQuery()` → `englishName()` + `partnerIds()` → `stayProviders()` → `searchXotelo()` | `liteapi.search()` | `demoStays.search()` → bez hotelů v místě `osmLodging()` → sloučení duplicit → `rankStays()` → `stayLinks()` (+ `affiliate()`); „Vybrat“ → `api/stays/check` → `checkHotel()`.
- **Počasí**: `Weather.forecast()` / `loadWeather()` → GET `api/weather?pts=` → `parsePts()` → `weatherAt()` (store, inflight, limit wxHits jen tiše) → `load()` MET Norway → `daysFrom()` + `nowFrom()`; dál než 9 dní `Weather.normal()` → `api/climate` → `climateAt()` (`data/climate.json`); DEMO → null → průměr.
- **Sdílení odkazem**: `ShareLink.prepare()` (`pack()` za #) → `send()` (navigator.share | schránka); cesta/plán `short()` POST `api/share` → `createShare()` → Upstash `s:<id>` → `/c/<id>` → `sharePage()` → `/#s=<id>` → `shortFromHash()` GET `api/share/<id>` → `Trip.importFromHash()` / `importPlanFromHash()` → sanitizér; pozvánka `/j/<data>` → `invitePage()` → `/#jed=` → `ShareCard.landing()`.
- **Offline/PWA**: GET `/` → `serveIndex()` (`versionAssets()` ?v=, `headTags()`, meta atlas-build, `pageCsp()`) → `public/js/pwa.js` po `Lazy.settled` registruje `public/sw.js` → GET `/sw.js` → `server/lib/pwa.js` `serveServiceWorker()` (BUILD + PRECACHE z obsahu) → `install` → fetch: `public/sw.js` `route()` → API, /c/, /j/ přímo síť, jinak `networkFirst()` (stránka po 1,5 s nebo u spícího serveru z kopie) → `checkVersion()` HEAD `/sw.js` (x-atlas-build) → lišta nové verze → `reloadFresh()`.

## API
Tabulka odpovídá pořadí větví v `route()` (`server/index.js`). Limity jsou na IP, okno 10 min, pokud není uvedeno jinak; podrobnosti v README ## Jak to funguje → ### API. Pomocníci limitů ve sloupci Pozn. (`rateLimited()`, `exploreLimited()`, `exploreCharge()`, `shareGetLimited()`) a jména limitů (hits, shareGets…) jsou v `server/index.js`.

| Endpoint | Co dělá | Kód | Pozn. (limit, cache) |
|---|---|---|---|
| ANY `/healthz` | health check Renderu, text „ok“ | `server/index.js` `route()` | bez limitu, no-store |
| GET `/api/diag` | ostrý test zdrojů (aerolinky, hotely, Wikidata) | `server/index.js` `diagnose()` | hits (SEARCH_RATE_LIMIT), cache 5 min; na produkci jen výjimečně |
| GET `/api/health` | stav: demo, zdroje, fx, cache, fronta hledání, clientErrors, shortLinks, mapy; feedback/support/operator z env | `server/index.js` `searchStats()`, `providerStatus()`, `mapyStatus()`, `fxInfo()` | bez limitu; bezpečná kontrola produkce |
| POST `/api/client-error` | chyba z prohlížeče → řádek do logu, 204 | `server/lib/clienterr.js` `cleanReport()`, `recordClientError()` | ≤ 4 kB, 30/h (clientErrs); jiná metoda 405; přijaté = počet `js_error` |
| POST `/api/count` | souhrnné počítání {e: událost z `EVENTS`} → +1 k dennímu součtu, 204 | `server/lib/counts.js` `makeCounter()` → `hit()` | ≤ 256 B, 120/10 min (countHits) a 30/10 min na adresu+událost (countPairs); neznámá a serverová událost (`SERVER_EVENTS`) 400; jiná metoda 405; IP ani hlavičky se neukládají |
| GET `/api/stats` | denní součty událostí za ?days= (1–90, výchozí 30) → {days: [{day, counts}], total} | `server/lib/counts.js` `stats()`, `clampDays()` | bez `STATS_KEY` veřejné, public 5 min; s ním jen `Authorization: Bearer <klíč>` (`statsKeyOk()`), jinak 401, špatný klíč 10/h (statsFails) → 429, odpověď no-store; úložiště nejvýš 1× za 5 min; výpadek úložiště 503 |
| POST `/api/trace` | záznam návštěvy se souhlasem {id, s: [[sekund, událost], …]} nebo odvolání {id, del: 1} → 204 | `server/lib/traces.js` `cleanTrace()`, `makeTraces()` → `add()` | ≤ 4 KB (jinak 413), 30/10 min z adresy (traceHits); vždy 204, zahozený záznam taky; adresa ani prohlížeč se neukládají; nejvýš 300 návštěv denně, zápis 1× za 30 min (HLEN + HSET + EXPIRE 30 dní) |
| GET `/api/traces` | záznamy návštěv za ?days= (7–30) → {days, visits: [[kroky]]} bez ID a dne | `server/lib/traces.js` `traces()` | bez `STATS_KEY` 404, jinak jen `Authorization: Bearer <klíč>` jako `/api/stats` (401, špatný klíč 10/h → 429), no-store; 30 dní jedním dotazem, mezipaměť 10 min |
| POST `/api/share` | uloží krátký odkaz {k: trip/plan, j} → {id} | `server/lib/shortlinks.js` `createShare()`; fotka náhledu `previewPhoto()` (`server/index.js`) | 30/h (shareHits); bez úložiště 503; jiná metoda 405 |
| GET `/api/share/<id>` | obsah krátkého odkazu {k, j} | `server/lib/shortlinks.js` `loadShare()` | shareGets 60/10 min jen mimo mezipaměť (`shareGetLimited()`); public 1 den; 404; počty `shared_open` / `shared_broken` |
| GET `/api/places` | našeptávač Odkud/Kam (q, near, role, remote, nature) | `server/lib/places.js` `suggest()` | bez limitu (bez sítě) |
| GET `/api/geocode` | města a místa pro Objevuj a program (mapy=1, cc) | `server/lib/places.js` `geocodeExplore()` | Mapy.com jen pod mapySugs (EXPLORE_RATE_LIMIT), jinak tiše bez nich |
| GET `/api/nearby` | ≤ 15 letišť u bodu s cestou na letiště | `server/index.js` `accessParams()`, `withTrip()` → `airportsNear()`, `airportAccess()` | bez limitu; volá jen `test/server.test.js` |
| GET `/api/origins` | letiště odletu s cenou cesty na letiště | `server/lib/places.js` `resolveOrigins()` + `withTrip()` (`server/index.js`) | bez limitu; from ≤ 8, radius ≤ 600, max 20 letišť |
| GET `/api/stays/check` | živé volno vybraného hotelu | `server/lib/stays.js` `checkStay()` | stayChecks (VERIFY_RATE_LIMIT); bez mezipaměti |
| GET `/api/stays` | hotely s cenami a odkazy na partnery | `server/lib/stays.js` `searchStays()` | hits (SEARCH_RATE_LIMIT); cache 45 min, neúplné 5 min; bez nabídek (do 30 nocí) počet `stay_empty` |
| GET `/api/verify` | živá cena letu z Kiwi, open-jaw | `server/providers/kiwi.js` `kiwi.exact()`, `server/lib/fares.js` `makeTrip()` | verifies (VERIFY_RATE_LIMIT); DEMO nebo KIWI_ENABLED=0 → available:false |
| GET `/api/photos` | fotky měst (t=Řím\|Tirana) | `server/lib/photos.js` `cityPhotos()`, `photosCached()` | photoHits jen mimo mezipaměť; 1 h / 6 h / 24 h |
| GET `/api/climate` | podnebí: month / cc / iata / lat+lon | `server/lib/climate.js` `seasonMonth()`, `countryClimate()`, `airportClimate()`, `climateAt()` | bez limitu; public 7 dní |
| GET `/api/weather` | předpověď MET pro ≤ 40 míst; tz=1 jen časová pásma | `server/lib/weather.js` `weatherAt()`, `tzAt()` | wxHits tiše (bez nových dotazů na MET); private 15 min |
| GET `/api/ground` | vlak/bus místo letadla, s datem živý RegioJet | `server/lib/ground.js` `groundQuery()`, `groundInfo()` | živě jen do hits, jinak odhad; GroundError → 400 |
| GET `/api/cars` | odkazy na půjčovny (items vždy []) | `server/lib/cars.js` `searchCars()` | bez limitu, bez sítě |
| GET `/api/fuel` | ceny PHM a nabíjení EV | `server/lib/fuel.js` `fuelInfo()` | bez limitu; 1 h |
| GET `/api/fx` | kurzy se základem CZK pro okno země (IP uživatele nejde ke zdroji) | `server/index.js` → `server/lib/fx.js` `loadRates()` | fxHits 60/10 min; jen mezipaměť serveru, bez dotazu ven navíc; public 1 h |
| GET `/api/poi` | místa kolem bodu (radius 1–25) | `server/lib/poi.js` `findPlaces()` | `exploreLimited()` placesCached |
| GET `/api/poi/trips` | cíle výletů do ~120 km | `server/lib/poi.js` `findTrips()` | `exploreLimited()` tripsCached; výpadek Wikidat 503 |
| GET `/api/poi/country` | celá země; cat = „Co hledáš?“ | `server/lib/poi.js` `countryHighlights()`, `countryCategory()` | `exploreLimited()` countryCached / countryCatCached |
| POST `/api/itinerary` | program po dnech (≤ 31 dní) | `server/lib/poi.js` `findPlaces()` → `server/lib/itinerary.js` `planItinerary()`, `keepOf()` | `exploreLimited()` placesCached |
| GET `/api/nature` | leží bod v horách/přírodě? | `server/lib/hikeplan.js` `natureAreaAt()` | bez limitu a sítě; 1 den |
| POST `/api/hikeplan` | túra na každý den pobytu | `server/lib/hikeplan.js` `planHikes()` | explore + `exploreCharge()` (LIMIT → 429); tiles 'mapy' |
| POST `/api/roadtrip` | výlety / okruh z místa (region) | `server/lib/poi.js` `findTrips()` → `server/lib/regions.js` `keepInRegion()` → `server/lib/roadtrip.js` `planTrips()` | `exploreLimited()` tripsCached |
| POST `/api/stayplan` | návrh trasy pobytu / přepočet (bases) | `server/lib/stayplan.js` `planStay()` | bez bases hits; s bases měkký rechecks (jen bez nových tras); StayPlanError → 400 |
| POST `/api/bike` | okruh na kole / vlakem tam, na kole zpět | `server/lib/bike.js` `bikeLoop()`, `bikeFromStation()` | `exploreCharge()`; NO_STATION 404, WDQS 503 |
| POST `/api/hike` | pěší okruh (u hor start u cíle) | `server/lib/bike.js` `hikeLoop()` | `exploreCharge()` |
| POST `/api/search` | hledání letů, NDJSON stream | `server/index.js` `handleSearch()` → `server/lib/search.js` `search()` | NA PRODUKCI NEVOLAT; hits 40 (trip `'multi'` 2×), 8 na IP → 429, fronta 4+20 → 503; hotové 120 s, radar 30 min; počty `search_empty` / `search_error` (jen nově spočítané), `search_limit`, `search_busy` |
| GET `/api/tiles/mapy/<sada>/<z>/<x>/<y>[@2x]` | dlaždice Mapy.com přes server | `server/lib/mapy.js` `parseTile()`, `mapyOn()`, `mapyTile()` | tileHits (TILES_RATE_LIMIT); no-store; bez klíče 404; chyba 503 |
| ANY `/api/` (ostatní) | 404 JSON „Neznámý endpoint“ (i GET na POST-only) | `server/index.js` `route()` | — |
| GET `/sw.js` | service worker s BUILD a PRECACHE | `server/lib/pwa.js` `serveServiceWorker()` | no-cache, ETag |
| GET `/robots.txt` | vše povoleno + Sitemap | `server/lib/seo.js` `robotsTxt()` | 1 h |
| GET `/sitemap.xml` | jediná adresa webu | `server/lib/seo.js` `sitemapXml()` | 1 h |
| GET `/manifest.webmanifest` | manifest s názvem z BRAND | `server/lib/seo.js` `serveManifest()`, `manifestFor()` | no-cache |
| GET `/c/<id>` (8 znaků) | náhled krátkého odkazu → `/#s=<id>` | `server/lib/shortlinks.js` `loadShare()`, `sharePage()` | jen se shareStore; private 1 h, Vary UA, X-Atlas-Build: preview, CSP bez skriptů (`PREVIEW_CSP`) |
| GET `/j/<data>` | náhled pozvánky → `/#jed=<data>` | `server/lib/shortlinks.js` `inviteMeta()`, `invitePage()` | nic se neukládá; fotka jen robotu |
| GET `/data/countries.json`, `/data/entry.json` | jediné soubory z data/ přes HTTP | `server/index.js` `serveFile()` | max-age 1 h |
| GET `/`, `/index.html` | stránka aplikace s verzí a CSP | `server/lib/pwa.js` `serveIndex()` + `server/lib/seo.js` `headTags()` | no-cache, ETag, X-Atlas-Build |
| GET `/vendor/…`, jiný soubor z public/ | statické soubory | `server/index.js` `serveFile()`, `versionOf()` | html/js/css no-cache; /vendor/ 30 dní; jinak 60 s; ?v= shodné → immutable 1 rok |
| cokoli jiného | česká 404 s vlastní CSP | `server/lib/seo.js` `serveNotFound()` | nečitelná URL 400, mimo public/ 403 |

## Server

### server/
- `server/index.js` – HTTP server: ručně psaný router `route()` (řetězec if, na pořadí záleží), hledání letů jako NDJSON s frontou a sdílenými výsledky, limity na IP, náhledy /c/ a /j/, statika, start a vypnutí. Klíčové: `route()`, `createServer()`, `handleSearch()`, `streamSearch()`, `sharedSearch()`, `revalidate()`, `searchKeys()`, `completeResult()`, `rateLimited()`, `exploreLimited()`, `exploreCharge()`, `sendJson()`, `readBody()`, `serveFile()`, `accessParams()`, `diagnose()`, `warmUp()`, `previewPhoto()`.
- `server/config.js` – proměnné prostředí (+ volitelný `.env`) → objekt `config` jednou při importu; čističe vstupů. Klíčové: `config`, `num()`, `cleanEmail()`, `cleanPayUrl()`, `cleanOperator()`, `cleanSiteUrl()`.
- `server/brand.js` – název, titulek, popisy, výchozí URL a náhledový obrázek na jednom místě (změna = nová verze SW). Klíčové: `BRAND`.

### server/lib/
- `server/lib/access.js` – cesta z domova na letiště a zpět (MHD, auto, palivo, parkování, známky), bez sítě. Klíčové: `airportAccess()`, `transitAccess()`, `carAccess()`, `carTrip()`, `parkCzk()`, `normalizeAccess()`, `accessOpts()`, `carEnergy()`, `fuelCountry()`, `ACCESS`, `TOLLS`.
- `server/lib/airlines.js` – názvy aerolinek a rodiny dceřiných (W4/W9/5W → W6, RK/AL/RR/OE → FR, EC/DS → U2). Klíčové: `AIRLINES`, `airlineName()`, `carrierFamily()`.
- `server/lib/airports.js` – databáze letišť z `data/airports.json` (+ `data/airport-pax.json`, `data/countries.json`). Klíčové: `AIRPORTS`, `getAirport()`, `destKey()`, `destInfo()`, `airportsNear()`, `countryAt()`, `airportsInCountry()`, `sizePenaltyKm()`, `COUNTRY_BY_ISO`, `METRO_BY_CODE`.
- `server/lib/arrival.js` – z letiště příletu do města (tabulka `data/arrival.json`, jinak odhad), Kč na osobu. Klíčové: `arrivalTransfer()`, `arrivalCzk()`, `legArrivalCzk()`, `arrivalsFor()`, `estimateArrival()`, `fareCzk()`.
- `server/lib/baggage.js` – odhad příplatků za zavazadla podle dopravce (EUR, stav 10/2026). Klíčové: `bagFeeEur()`, `legBagEur()`, `CARRIERS`, `UNKNOWN`.
- `server/lib/bike.js` – kolo a pěšky přes BRouter (záloha Mapy.com), starty túr a nádraží z Wikidat. Klíčové: `bikeLoop()`, `hikeLoop()`, `bikeFromStation()`, `hikeThereBack()`, `parseRoute()`, `hikeMinutes()`, `trailheadsNear()`, `stationsNear()`, `stationNearCached()`, `mockBikeLoop()`.
- `server/lib/brouter.js` – sdílený klient BRouteru: 1 dotaz naráz, mezera BROUTER_GAP_MS, fronta 20 (plná → BUSY). Klíčové: `brouterGet()`, `BROUTER`, `UA`.
- `server/lib/cache.js` – TTL mezipaměť v paměti se sdílením rozběhnutých dotazů a pojistkou RSS (CACHE_SOFT_MB 320). Klíčové: `cache`, `TTLCache`, `wrap()`, `get()`, `set()`, `sweep()`, `checkMemory()`, `stats()`.
- `server/lib/cars.js` – půjčení auta: validace dotazu a odkazy na srovnávače, bez cen a sítě. Klíčové: `searchCars()`, `normalizeCarQuery()`, `CarQueryError`.
- `server/lib/clienterr.js` – chyby z prohlížeče: vyčistit, řádek do logu Renderu, posledních 50 v paměti. Klíčové: `cleanReport()`, `recordClientError()`, `clientErrorCount()`, `MAX_BODY`.
- `server/lib/climate.js` – dlouhodobé podnebí z `data/climate.json` (líně): bod, letiště, země, měsíc, „za teplem“. Klíčové: `climateAt()`, `airportClimate()`, `monthClimate()`, `countryClimate()`, `seasonMonth()`, `warmAirports()`, `warmShare()`, `mainAirport()`, `sourceText()`.
- `server/lib/counts.js` – souhrnné denní počty událostí bez osobních údajů: klíč cnt:<den UTC>:<událost>, Upstash (TTL 400 dní) nebo paměť; zápis po dávkách jednou za 30 min (`FLUSH_MS`; nepovedená dávka se zahodí, ne zdvojí). Klíčové: `EVENTS` (nejvýš `MAX_EVENTS` = 150 kvůli rozpočtu Upstash), `SERVER_EVENTS`, `makeCounter()` (`hit()`, `flush()`, `stats()`), `upstashCounts()`, `memoryCounts()`, `clampDays()`, `statsKeyOk()`, `FLUSH_MS`, `MAX_BODY`.
- `server/lib/traces.js` – záznam průchodu návštěvou jen se souhlasem (Pomáhat se zlepšováním): hash tr:<den UTC> (pole = náhodné ID návštěvy, hodnota = kroky), Upstash s dobou života 30 dní od posledního zápisu dne (smaže se do 31 dnů) nebo paměť; nejvýš `CAP` = 300 návštěv denně (HLEN před zápisem, přežije restart), zápis 1× za 30 min, odvolání = HDEL dnes a včera. Bez nabídky Plus, průzkumu ceny a odpovědí na otázky (`traceExcluded()`). Klíčové: `cleanTrace()`, `makeTraces()` (`add()`, `flush()`, `traces()`), `upstashTraces()`, `memoryTraces()`, `TRACE_EVENTS`.
- `server/lib/crowd.js` – ochrana při návalu: sdílené běhy, fronta, hotové výsledky, strop na adresu, střídání práce na vlákně. Klíčové: `sharedRuns()`, `gate()`, `recentResults()`, `perClient()`, `breathe()`.
- `server/lib/dates.js` – data YYYY-MM-DD počítaná v UTC a převody časových pásem. Klíčové: `todayYmd()`, `addDays()`, `daysBetween()`, `chunkRange()`, `clampRange()`, `localToUtcMs()`, `utcToLocalIso()`, `flightMinutes()`.
- `server/lib/daytrips.js` – řazení a popis jednodenních výletů (význam, dosah, důvod); volá ho jen `server/lib/poi.js`. Klíčové: `rankTrips()`, `reachOf()`, `whyOf()`, `parseGoNext()`, `CLASSICS`.
- `server/lib/fares.js` – jednotný tvar letu (leg) a cesty (trip) napříč zdroji. Klíčové: `makeLeg()`, `makeTrip()`, `validTrip()`.
- `server/lib/fuel.js` – ceny nafty a benzínu (ČSÚ, Weekly Oil Bulletin EK) a nabíjení EV, stale-while-revalidate. Klíčové: `fuelInfo()`, `fuelPrice()`, `carFuelCzk()`, `fuelSnapshot()`, `refreshFuel()`, `parseCzso()`, `parseWob()`, `FALLBACK`, `EV_DC`, `COUNTRIES`.
- `server/lib/fx.js` – kurzy (open.er-api.com → ECB → záloha, cache 6 h; prohlížeč je bere přes `/api/fx`) a převod do Kč. Klíčové: `loadRates()`, `convert()`, `toCzk()`, `fxInfo()`, `FALLBACK_EUR`.
- `server/lib/geo.js` – vzdálenost, normalizace textu (bez diakritiky, ł/ø/æ/ß/đ/ı převádí; horká cesta s pamětí), čas letiště–město. Klíčové: `haversineKm()`, `normalize()`, `groundEstimate()`.
- `server/lib/ground.js` – vlak/bus místo letadla: odhad, srovnání od dveří ke dveřím, odkazy, živé spoje RegioJetu. Klíčové: `groundInfo()`, `groundQuery()`, `estimate()`, `distanceModel()`, `worth()`, `attachGround()`, `regiojet()`, `links()`, `groundPlace()`, `GroundError`.
- `server/lib/hikeplan.js` – túry na víc dní (cíl na den, start, trasa BRouterem, jídlo z Overpass) a oblast hor. Klíčové: `planHikes()`, `natureAreaAt()`, `goalCandidates()`, `pickGoals()`, `pickStart()`, `foodAlong()`, `assembleDay()`, `mockHikePlan()`.
- `server/lib/hours.js` – zavírací dny a otevírací doby památek z `data/sight-hours.json`. Klíčové: `sightHours()`, `closedOn()`, `closedWhy()`, `closedDaysText()`, `hoursNote()`.
- `server/lib/http.js` – HTTP klient pro cizí služby: timeout, opakování 5xx, cookies, souběh, chyba bez URL. Klíčové: `request()`, `HttpError`, `publicMessage()`, `CookieJar`, `limiter()`, `BROWSER_UA`.
- `server/lib/itinerary.js` – plánovač programu ve městě bez AI: dny, pořadí, časy, oběd, tipy. Klíčové: `planItinerary()`, `dayCapacities()`, `visitMinutes()`, `mustSeeIds()`, `clusterDays()`, `closedFix()`, `orderRoute()`, `dayTimeline()`, `addTips()`, `keepOf()`.
- `server/lib/links.js` – předvyplněné odkazy na ubytování a půjčovny, affiliate přes tp.media (tvary URL ověřené v Chromu). Klíčové: `stayLinks()`, `carLinks()`, `affiliate()`, `affiliateOn()`, `googleHotelsTs()`, `bookingSearchUrl()`, `tripSearchUrl()`.
- `server/lib/longhaul.js` – dálkové lety: světadíly, země pro Kamkoliv a za teplem, hlavní a přestupní letiště. Klíčové: `CONTINENTS`, `continentCountries()`, `LONG_HAUL_SWEEP`, `WARM_SWEEP`, `HUBS`, `hubsOf()`, `hubsNear()`, `FAR_KM`.
- `server/lib/mapy.js` – volitelné Mapy.com (MAPY_API_KEY): dlaždice přes server, hledání míst, záloha tras; nic se neukládá. Klíčové: `mapyOn()`, `mapyReady()`, `mapyStatus()`, `mapySuggest()`, `mapyRouteFull()`, `parseTile()`, `mapyTile()`, `charge()`, `gate()`.
- `server/lib/multi.js` – cesta přes víc měst: návaznost letů, výběr na úsek, skládání celých cest. Klíčové: `MULTI`, `legFits()`, `pickOptions()`, `linkMatrix()`, `buildCombos()`, `pairsPerLeg()`, `runLimited()`, `mergeStatus()`.
- `server/lib/names.js` – statické seznamy: české a cizí názvy, metropole, města domova, regiony, příroda, aliasy zemí. Klíčové: `CITY_CS`, `AIRPORT_CITY_CS`, `EXONYMS`, `METROS`, `CITIES`, `REGIONS`, `NATURE`, `NATURE_KINDS`, `COUNTRY_ALIASES`.
- `server/lib/optimizer.js` – čistá logika: nejlevnější zpáteční a jednosměrné cesty, varianty na den, kalendář, mřížka. Klíčové: `bestRoundTrips()`, `bestOneWays()`, `legsPerDay()`, `dayVariety()`, `cheapestPerDay()`, `dateOk()`, `returnFits()`, `oneWayCalendar()`, `gridArray()`.
- `server/lib/partnerids.js` – ID místa u Trip.com, Agody a Hostelworldu pro předvyplněné odkazy (cache 30 dní). Klíčové: `partnerLookups()`, `partnerIds()`, `tripCityId()`, `agodaCityId()`, `hostelworldCity()`.
- `server/lib/photos.js` – fotky měst (Pexels/Unsplash s klíčem, jinak Wikimedia s autorem a licencí), mezipaměť ph7. Klíčové: `cityPhotos()`, `photosCached()`, `pickPhotos()`, `bestPhotos()`, `photoScore()`, `commonsCredit()`, `pexelsPick()`, `unsplashPick()`.
- `server/lib/places.js` – našeptávač míst, geokódování z `data/places.json`, převod výběru na letiště. Klíčové: `suggest()`, `localScored()`, `rank()`, `loadPlaces()`, `geocode()`, `geocodePlaces()`, `geocodeExplore()`, `englishName()`, `describe()`, `resolveOrigins()`, `resolveDestinations()`.
- `server/lib/poi.js` – zajímavá místa z Wikidat, Wikipedie a Wikivoyage: okolí, výlety, města pro trasu, celá země. Klíčové: `findPlaces()`, `findTrips()`, `findTowns()`, `countryHighlights()`, `countryCategory()`, `groupBindings()`, `scorePlace()`, `wdqs()`, `enrich()`, `placesCached()`, `mockPlaces()`, `UA`.
- `server/lib/pricelevel.js` – „Je to dobrá cena?“: statistika cen a úroveň ceny (zrcadlo `public/js/pricecheck.js`). Klíčové: `priceLevelOf()`, `levelOf()`, `priceStats()`, `referencePrice()`, `refOf()`.
- `server/lib/pwa.js` – `public/sw.js` s verzí podle obsahu a seznamem pro offline; `public/index.html` s otisky ?v=, head značkami a CSP. Klíčové: `serveIndex()`, `serveServiceWorker()`, `serviceWorker()`, `versionAssets()`, `shellAssets()`, `cssAssets()`, `contentVersion()`, `RUNTIME_ASSETS`.
- `server/lib/ratelimit.js` – klouzavé okno požadavků na IP s omezenou pamětí; `sweep()` každých 30 s smaže adresy mimo okno (slib v O aplikaci). Klíčové: `RateLimiter`, `hit()`, `sweep()`, `prune()`.
- `server/lib/regions.js` – hranice oblastí z `data/regions.json` pro okruh jen v oblasti. Klíčové: `hasRegion()`, `inRegion()`, `keepInRegion()`.
- `server/lib/roadtrip.js` – výlety z místa: jednodenní smyčky nebo vícedenní okruh, autem nebo vlakem/busem (odhad). Klíčové: `planTrips()`, `bestDayLoop()`, `planLoop()`, `splitDays()`, `TRANSPORT`, `INTERESTS`, `overnightUrl()`.
- `server/lib/search.js` – orchestrace hledání letů: dotaz → letiště → zdroje → skládání → ocenění, řazení a odpověď (i víc měst a radar). Klíčové: `search()`, `normalizeQuery()`, `searchMulti()`, `routeProvider()`, `exploreFrom()`, `routeTrips()`, `mixTrips()`, `compose()`, `buildGroups()`, `planRoutes()`, `settle()`, `topWithDays()`, `radarResult()`, `legBagCzk()`, `UserError`.
- `server/lib/security.js` – bezpečnostní hlavičky, CSP stránky a API, IP klienta, blokace API z cizích webů. Klíčové: `SECURITY_HEADERS`, `API_CSP`, `pageCsp()`, `CONNECT`, `inlineScriptHashes()`, `clientIp()`, `ipKey()`, `crossSite()`.
- `server/lib/seo.js` – head značky, robots.txt, sitemap.xml, manifest z BRAND, česká 404, generované odpovědi s ETagem. Klíčové: `headTags()`, `robotsTxt()`, `sitemapXml()`, `manifestFor()`, `serveManifest()`, `notFoundHtml()`, `serveNotFound()`, `sendGenerated()`.
- `server/lib/shortlinks.js` – krátké odkazy /c/<id> (Upstash REST, TTL 400 dní) a pozvánky /j/<data> bez úložiště, HTML náhledy. Klíčové: `upstashStore()`, `memoryStore()`, `cachedStore()`, `createShare()`, `loadShare()`, `sharePage()`, `inviteMeta()`, `invitePage()`, `PREVIEW_BOT`.
- `server/lib/stayplan.js` – pobyt na víc místech: návrh 2–4 míst s nocemi, přejezdy, palivem, mýtným a jízdným; přepočet trasy. Klíčové: `planStay()`, `suggestRoute()`, `evaluateRoute()`, `transfer()`, `splitNights()`, `hotelCoverage()`, `tollCzk()`, `TRANSFER_MAX`, `StayPlanError`.
- `server/lib/stays.js` – hledání ubytování: dotaz, zdroj, záloha OSM, duplicity, řazení, odkazy. Klíčové: `searchStays()`, `normalizeStayQuery()`, `checkStay()`, `rankStays()`, `adjustedRating()`, `StayQueryError`.
- `server/lib/transfers.js` – přejezdy mezi místy: auto z BRouteru + provoz, hranice, zácpy; vlak/bus podle `data/transfers.json`. Klíčové: `transferTimes()`, `routeTransfers()`, `driveRoute()`, `cachedRoute()`, `railLink()`, `hsrMin()`, `transitKind()`, `RULES`.
- `server/lib/weather.js` – předpověď MET Norway přes server (ukládání podle Expires, sloučené dotazy). Klíčové: `weatherAt()`, `parsePts()`, `daysFrom()`, `nowFrom()`, `wmoOf()`, `tzAt()`, `load()`.

### server/providers/
- `server/providers/index.js` – registr zdrojů letenek a jejich stav pro `/api/health` (rozhraní zdroje v komentáři). Klíčové: `activeProviders()`, `providerStatus()`, `PROVIDER_INFO`.
- `server/providers/kiwi.js` – Kiwi.com přes oficiální MCP (JSON-RPC, zdarma): lety po oknech, Kamkoliv, živé ověření. Klíčové: `kiwi.daily()`, `kiwi.search()`, `kiwi.exact()`, `kiwiContext()`, `kiwiBlocked()`, `parseKiwiSearch()`, `withRetry()`.
- `server/providers/mock.js` – deterministická vymyšlená data pro DEMO a testy (demo-air, demo-jet). Klíčové: `makeMock()`, `mockProviders`.
- `server/providers/ryanair.js` – Ryanair Fare Finder API (bez klíče) a letový řád. Klíčové: `ryanair.explore()`, `ryanair.daily()`, `ryanair.departures()`, `bookingUrl()`, `parseCheapestPerDay()`, `warmSession()`, `isBlocked()`.
- `server/providers/travelpayouts.js` – Travelpayouts/Aviasales Data API: ceny z cache hledání (~48 h, live:false), jen s TRAVELPAYOUTS_TOKEN. Klíčové: `travelpayouts.explore()`, `travelpayouts.daily()`, `parsePricesForDates()`, `bookingUrl()`, `cachedDuration()`.
- `server/providers/wizzair.js` – Wizz Air, neveřejné API webu (síť tras, ceny po dnech) s pamětí tras. Klíčové: `wizzair.daily()`, `wizzair.network()`, `wizzair.destinations()`, `wizzair.routeState()`, `timetable()`, `missingWindows()`, `bookingUrl()`.
- `server/providers/stays/index.js` – registr poskytovatelů ubytování a specifikace objektu Stay (v komentáři). Klíčové: `stayProviders()`, `liteapiLive()`, `liteapiTestKey()`.
- `server/providers/stays/demo.js` – vymyšlené hotely pro DEMO (Pachino a Castelmezzano předvádí „ceny z okolí“). Klíčové: `demoStays`.
- `server/providers/stays/liteapi.js` – LiteAPI (Nuitée): hotely ve městě a živé ceny, jen s ostrým klíčem. Klíčové: `liteapi`, `mapHotels()`, `cheapestRate()`, `occupancies()`.
- `server/providers/stays/osm.js` – ubytování z OSM přes Nominatim bez ceny tam, kde jiný zdroj nic nemá (i s XOTELO=off, ne u LiteAPI; max 1 dotaz/s). Klíčové: `osmLodging()`, `mapOsm()`, `rankOsm()`, `sameLodging()`.
- `server/providers/stays/ta-places.js` – data: místa TripAdvisoru s hotely (~5 700 řádků, nečíst celé, grep). Klíčové: `TA_PLACES`.
- `server/providers/stays/xotelo.js` – Xotelo (neoficiální API nad TripAdvisorem): místo, hotely, ceny webů, okolí, volno. Klíčové: `searchXotelo()`, `xotelo`, `locationKeys()`, `seedCity()`, `nearbyPlaces()`, `hotelList()`, `hotelRates()`, `checkHotel()`, `priceOf()`, `xoteloBlocked()`, `TA_CITIES`.

## Prohlížeč
- `public/index.html` – kostra PWA: inline motiv z atlas_v1, ikony a splash, CSS, #launch, panel `#nav`, 7 sekcí `#view-…`, spodní lišta `#mobileNav`, `#modalBg`, `#toast`; závazné pořadí `<script>`; `js/lazy.js` s data-later (sharecard, pretrip, places, trip) a data-files (d3, topojson, MapLibre); bloky `<!-- brand -->` a `<!-- ios-splash -->` dosazuje server a skript.
- Adresy za # (`public/js/app.js`: `hashView()`): sekce #dashboard #flights #trip #explore #map #countries #recommend, #planner (→ Moje cesty), #now; data #trip= #plan= #s= #sync= #offer= #jed= #watch=.

### public/js/
- `public/js/about.js` – okno ℹ️ O aplikaci a soukromí (zdroje dat, co se ukládá, 💬/💛, provozovatel). Klíčové: `open()`, `html()`, `SOURCES`, `okEmail()`, `okPay()`, `addToMenu()`. API: `api/health` (přes `Flights.warm()`).
- `public/js/alerts.js` – ♡ hlídané ceny, čistá logika: kdy kontrolovat a upozornit, historie, klouzavý termín, tip kdy koupit, .ics připomínka. Klíčové: `scheduler()`, `dueWatches()`, `applyCheck()`, `shouldNotify()`, `upsertWatch()`, `mergeWatches()`, `buyTip()`, `remindEvent()`, `CFG`, `PV`.
- `public/js/app.js` – jádro (globální skript, ne IIFE): pomocníci, stav S, navigace a Zpět, motiv, Přehled, Co je nového, fotky, Doporučení, Země, mapa světa, Moje cesty, odkazy v #hash, start. Klíčové: `esc()`, `save()`, `go()`, `histPop()`, `modalOpen()`, `toast()`, `renderDash()`, `openCountry()`, `initMap()`, `myTrips()`, `openTrip()`, `boot()`. API: `api/photos`, `api/climate`, `api/weather`, `api/fx`, `api/places`, `api/share/<id>`, `data/countries.json`.
- `public/js/backup.js` – 💾 záloha a obnova všech dat (JSON v:1), náhled, Sloučit/Nahradit; jádro i pro 📲 přenos. Klíčové: `open()`, `pack()`, `parse()`, `match()`, `diff()`, `merge()`, `replace()`, `preview()`, `apply()`, `restore()`, `cleanRefs()`, `snapshot()`.
- `public/js/count.js` – souhrnné počítání: pošle jen název události (sendBeacon, jinak fetch keepalive), nic neukládá do prohlížeče, offline nic. Klíčové: `hit()`, `view()`, `viewEvent()`, `ask()` (krátká otázka: řádek s čipy za prvkem nebo na místě `at`, odpověď = pevný název `mq_*`), `helping()`, `deep()` (podrobný počet jen se souhlasem, s onceKey nejvýš 1× za načtení), `consent()` (zapíše `atlas_help` až po klepnutí; vypnutí pošle del), záznam návštěvy jen v paměti stránky (ID po 30 min nečinnosti nové, odeslání při odchodu ze stránky), `rageTap()` (3 klepnutí do 1 s → `rage_<sekce>`, nejvýš 5×). Bez souhlasu žádný posluchač ani záznam. API: POST `api/count`, POST `api/trace`.
- `public/js/data.js` – statická data jako globální const: nálady, kódy počasí, tipy, seznamy balení. Klíčové: `VIBES`, `WC`, `wIco()`, `TIPS`, `PACK`, `PACK_OUT`, `PACK_BIKE`, `packFor()`.
- `public/js/entry.js` – 🛂 vstupní podmínky pro občany ČR: čipy, detail země, Před cestou, přestupy, připomínky. Klíčové: `load()`, `get()`, `cardChip()`, `flightChip()`, `detailHtml()`, `checklistHtml()`, `transitHtml()`, `reminders()`, `costs()`. API: `data/entry.json`.
- `public/js/errlog.js` – nezachycené chyby → server (bez #hash, max 1 za 10 s a 20 za relaci, ≤ 2 kB); načítá se v head před skripty aplikace. Klíčové: `makeReport()`, `report()`, `scrub()`, `limiter()`. API: POST `api/client-error`.
- `public/js/flags.js` – vlajky na Windows: když emoji vlajek chybí, přidá písmo `public/vendor/flags/TwemojiCountryFlags.woff2`. Klíčové: `colored()`, `faces`, `KEY`.
- `public/js/flights.js` – UI Letů a části Přehledu (~5 850 ř., IIFE, ven jen `window.Flights`): formulář, našeptávač, hledání, výpis, mapa, kalendář, hlídání, radar, ⭐/🙈, 📌, sdílení nabídky. Klíčové: `init()`, `getForm()`, `payloadOf()`, `startSearch()`, `runSearch()`, `renderResults()`, `addWatch()`, `renderRadar()`, `verifyOne()`, `offerShare()`, `warm()`. API: `api/health`, `api/search`, `api/places`, `api/origins`, `api/fuel`, `api/verify`, `api/geocode`.
- `public/js/ground.js` – 🚆 vlak/bus místo letadla v UI: čip, srovnání, panel spojů, úseky pro průvodce. Klíčové: `load()`, `panel()`, `worth()`, `flightDoor()`, `planeOptions()`, `chipText()`, `liveHtml()`, `legFromLive()`, `legFromEst()`. API: `api/ground`.
- `public/js/ics.js` – export do kalendáře (.ics RFC 5545, Google Kalendář), události letů, vlaků a check-inu. Klíčové: `build()`, `download()`, `gcalUrl()`, `flightEvent()`, `groundEvent()`, `checkin()`, `checkinEvent()`, `localToUtc()`.
- `public/js/kukatko.js` – kukátko, živý průvodce (vzhled Letsi, krok 4; knihovna z balíku identity 2.1 + napojení na ATLAS): jen s `<html data-brand="letsi">`, načte ho vložený skript na konci `public/index.html`, sám si přidá `public/css/kukatko.css`. Stavy pozná pozorováním DOM (`#progress`, `#results`, `.view.active`), do cizích modulů nesahá; Přehled u titulku, Lety řádek mezi `#progress` a `#results`, slunce = tečka před nejlevnější cenou. Klíčové: `Kukatko.mount()`, `popis()`, `faze()`, `stav()`, `dalsi()`, `slunce()`. Test `test/kukatko.test.js`.
- `public/js/lazy.js` – odložené moduly (`window.Lazy`) a adresy knihoven map s otiskem ?v=. Klíčové: `need()`, `run()`, `has()`, `soon()`, `settled`, `url()`, `inject()`.
- `public/js/offershare.js` – sdílení jedné nabídky `#offer=`: pročištění, text zprávy, povolené obchody. Klíčové: `sanitize()`, `SHOPS`, `shop()`, `fromPin()`, `json()`, `fromHash()`, `text()`.
- `public/js/pins.js` – 📌 odložené nabídky, čistá logika bez DOM (UI v `public/js/flights.js`). Klíčové: `fromRow()`, `fromRadar()`, `toggle()`, `refresh()`, `clean()`, `merge()`, `basis()`, `door()`, `rank()`, `shareText()`.
- `public/js/places.js` – Objevuj: hledání místa, seznam a mapa míst, celá země, plány (město, výlety, kolo, pěšky, túry); plánovač programu i pro průvodce. Klíčové: `renderExplore()`, `wireExploreSearch()`, `openPlace()`, `loadExplore()`, `paintExplore()`, `openWholeCountry()`, `makeMap()`, `renderPlanner()`, `makePlan()`, `makeHikePlan()`, `makeTrip()`, `plannerEntry()`, `preview()`. API: `api/geocode`, `api/places`, `api/poi`, `api/poi/trips`, `api/poi/country`, `api/itinerary`, `api/hikeplan`, `api/hike`, `api/bike`, `api/roadtrip`, `api/nature`, `api/tiles/mapy/`.
- `public/js/planshare.js` – plán z Mých cest odkazem `#plan=`: JSON, čištění, sloučení novější verze. Klíčové: `json()`, `sanitize()`, `fromHash()`, `merge()`, `verOf()`, `txt()`.
- `public/js/plus.js` – ⭐ Plus jako falešné dveře (platby neběží, nic se nezamyká): stránka Zdarma × Plus (⋯ Další), list „Místo pro jednu cestu máš obsazené“ před novou cestou (app.js saveTrip, trip.js saveToPlanner, flights.js multiSave), 📒 Sešit cesty ve Shrnutí a karta 14 dní před odletem na Přehledu (`#plusCard`), otázka na cenu nejvýš jednou za 30 dní (`atlas_price_q`, jen datum); název placené verze v `NAME`. Klíčové: `counts()`, `countedTrips()`, `needsGate()`, `gateFlow()`, `gateNewTrip()`, `askDue()`, `cardPick()`, `open()`, `sesit()`, `renderCard()`, `addToMenu()`.
- `public/js/pretrip.js` – karta „Co zařídit a co sbalit“ ve Shrnutí: úkoly, věci podle podnebí, odškrtnutí, připomínky. Klíčové: `html()`, `load()`, `contextOf()`, `todos()`, `pack()`, `setDone()`, `toPlanner()`, `fromPlanner()`, `reminders()`. API: `public/data/pretrip.json` (URL data/pretrip.json), `api/climate`.
- `public/js/pricecheck.js` – „Je to dobrá cena?“: úroveň ceny (zrcadlo serveru), paměť cen s trendem, rada. Klíčové: `levelOf()`, `assess()`, `statsOf()`, `remember()`, `memoryOf()`, `advice()`, `explain()`, `CFG`.
- `public/js/pwa.js` – obal fetch (české chyby, limit 2 min), offline pruh, barva lišty, instalace, registrace `public/sw.js`, lišta nové verze (defer). Klíčové: `readOrStall()`, `httpError()`, `statusMsg()`, `whenOnline()`, `install()`, `syncTheme()`, `checkVersion()`, `quietToReload()`, `askSw()`. API: HEAD/GET `sw.js`.
- `public/js/qr.js` – vlastní QR kodér (úrovně M a L) pro 📲 přenos. Klíčové: `encode()`, `svg()`, `capacity()`, `rs()`.
- `public/js/statistiky.js` – stránka `public/statistiky.html` (Statistiky pro majitele, noindex, z aplikace na ni nic nevede, mimo offline sadu – `public/sw.js` `route()`): hlavní čísla, trychtýř, Kde to drhne (serverové počty na 100), průzkum ceny Plus, falešné dveře, sekce, odpovědi na krátké otázky (`QUESTIONS`, `dist()`), tabulka po dnech; při 401 pole klíče (jen v paměti stránky, hlavička Authorization); čisté výpočty ve `window.Stats`, testy `test/statistiky.test.js` a `test/pocitadla.test.js`. Klíčové: `totals()`, `funnel()`, `rates()`, `SNAGS`, `survey()`, `median()`, `doors()`, `dayRows()`, `pct()`, `askKey()`, `dist()`. API: `api/stats?days=` (7/30/90).
- `public/js/rank.js` – doporučené pořadí: srovnávací cena = cena + přirážky − sleva; čistá logika. Klíčové: `W`, `score()`, `explain()`, `order()`, `pick()`, `reasons()`, `ctxOf()`, `radar()`.
- `public/js/recs.js` – doporučení „Kam vyrazit“ pro měsíc s body a důvody; čistá logika. Klíčové: `W`, `rank()`, `profile()`, `radarBest()`, `seaWeather()`, `defaultMonth()`, `monthRange()`.
- `public/js/searchhelp.js` – čistá logika Letů bez DOM a sítě (`window.SearchHelp`): cestující, filtry, lety po letech, radar, svátky, doprava na letiště, uložené výsledky. Klíčové: `paxOf()`, `timeOk()`, `distinctLegs()`, `radarQuery()`, `holidayList()`, `carTrip()`, `arrivalLine()`, `gridTrips()`, `lastPack()`, `draftLoad()`, `liveVerdict()`, `multiPlan()`.
- `public/js/sharecard.js` – „Jede někdo se mnou?“: okno Sdílet cestu, karty Story/příspěvek na canvasu, okno pro kamaráda z `#jed=`. Klíčové: `open()`, `render()`, `story()`, `post()`, `photo()`, `temp()`, `sanitize()`, `fromHash()`, `pathUrl()`, `landing()`. API: `api/photos`, `api/climate`.
- `public/js/sharelink.js` – kódování odkazů za # (deflate-raw + base64url „z…“), vlastní inflate, krátké odkazy, schránka a sdílení. Klíčové: `pack()`, `unpack()`, `inflateRaw()`, `prepare()`, `short()`, `shortNow()`, `copy()`, `send()`. API: POST `api/share`.
- `public/js/since.js` – 🕘 Od minula: řádky karty po návratu jiný den (zlevnění, blížící se cesta, radar, propadlé 📌). Klíčové: `gate()`, `digest()`, `watchNews()`, `tripNews()`, `radarNews()`, `gonePins()`.
- `public/js/smart.js` – ✨ hledání větou bez AI: česká věta → nastavení Letů, věta pro Objevuj. Klíčové: `parse()`, `rule()`, `seaFor()`, `stems()`, `bestPlace()`, `nominatives()`, `placeForms()`, `parseExplore()`, `fold()`.
- `public/js/transfer.js` – 📲 přenos dat do jiného zařízení odkazem `#sync=` a QR. Klíčové: `open()`, `addToMenu()`, `fromHash()`, `receive()`, `read()`, `fit()`.
- `public/js/trip.js` – průvodce cestou: let → trasa → ubytování → auto → program → shrnutí (S.trip), Moje cesty, `#trip=`, kalendář. Klíčové: `start()`, `render()`, `setStep()`, `flightStep()`, `routeStep()`, `stayStep()`, `carStep()`, `programStep()`, `summaryStep()`, `autoTrip()`, `saveToPlanner()`, `importFromHash()`, `sanitizeTrip()`. API: `api/verify`, `api/geocode`, `api/stays`, `api/stays/check`, `api/cars`, `api/nature`, `api/stayplan`, `api/itinerary`.
- `public/js/weather.js` – počasí: předpověď MET přes server (9 dní), dlouhodobý průměr, západ slunce, štítky. Klíčové: `forecast()`, `span()`, `trip()`, `days()`, `bestDay()`, `badge()`, `normal()`, `sunsets()`. API: `api/weather`, `api/climate`.

### Ostatní soubory v public/
- `public/sw.js` – service worker: síť napřed s ověřením, offline uložená kopie, nikdy starý kód; BUILD a PRECACHE dosadí server. Klíčové: `route()`, `networkFirst()`, `fresh()`, `remember()`, `confirmed()`, `lastSeen()`, `ASLEEP_AFTER`, `PAGE_TIMEOUT`.
- `public/manifest.webmanifest` – manifest PWA (standalone, #080c1a, ikony, zkratky /#flights, /#planner, /#now); name a short_name dosazuje `server/lib/seo.js` `serveManifest()`.
- `public/css/atlas.css` – základ: @font-face (`public/vendor/fonts/`), tokeny a motivy (`:root`, `[data-theme]`, `[data-map="dark"]`), layout, komponenty, Přehled, mapa, okna, responzivita, vstupní podmínky, O aplikaci, Záloha, Přenos.
- `public/css/flights.css` – Lety: našeptávač `.pi`, výsledky `.res-*`, kalendář, hlídání, radar `.radar-*`, víc měst `.mc-*`, `.wake-bar`, 📌 `.pin-*`, 🔎 `.dp-*`, Sdílet cestu `.jed-*`; druhá polovina přepisuje starší pravidla.
- `public/css/trip.css` – průvodce `.trip-*`, ubytování, Shrnutí, Objevuj `.ex-*`, místa `.poi`, trasa, auto, MapLibre, Moje cesty `.mt-*`, štítek reklama `.ad-tag`.
- `public/css/pretrip.css` – Před cestou `.pt-*` a tisk jen karty (`@media print`).
- `public/css/kukatko.css` – vzhled a pohyb kukátka (rám Noc / v tmavém Vápno, slunce Rajče, štítek „Mám to“ v Pistácii), vše pod `:root[data-brand="letsi"]`; načítá ho jen `public/js/kukatko.js`.
- `public/css/letsi.css` – vzhled značky Letsi, výchozí pro všechny (barvy a písma Onest + Unbounded): vše jen pod `:root[data-brand="letsi"]`, který úvodní skript v `public/index.html` nastaví vždy, kromě nouzové volby `?vzhled=atlas` (klíč `atlas_look` = `atlas`, `?vzhled=letsi` ji smaže); písma `public/vendor/fonts/letsi/` (OFL); krok 3 ikony, logo a znak maskou (`--letsi-ikona`) ze souborů `public/vendor/letsi/`; favicon Letsi je přímo v hlavičce. Test `test/vzhled-letsi.test.js`.
- `public/css/pwa.css` – offline pruh `.pwa-bar`, instalace, lišta nové verze `.pwa-update`, lišta Novinky `.wn-pop`.
- `public/css/desktop.css` – společný desktop od 1024 px: kontejner `--content-max`, mřížka `.d-grid`, nadpisy, karty.
- `public/css/desktop-flights.css` – desktop Lety, Přehled a Země (výsledky ve dvou sloupcích od 1200 px, radar, filtry Zemí).
- `public/css/desktop-explore.css` – desktop Objevuj (seznam a přilepená mapa), plánovač, Doporučení, Mapa, okna ve dvou sloupcích.
- `public/css/desktop-trip.css` – desktop průvodce: lišta kroků, od 1280 px krok a Přehled cesty vpravo (`#tripAside`), Shrnutí ve dvou sloupcích.
- `public/vendor/` – knihovny bez npm: `maplibre/` (MapLibre GL 5.24.0), `d3.min.js` 7.9.0, `topojson-client.min.js`, `countries-110m.json` (mapa světa, v PRECACHE), `flags/` (Twemoji), `fonts/` (Inter, Sora, Caveat, OFL; `fonts/letsi/` Onest a Unbounded pro `css/letsi.css` a náhledový obrázek), `letsi/` (ikony rozhraní, logo, znak a favicon z identity Letsi 2.1, původ v `letsi/README.md`); licence `public/vendor/LICENSES.txt`.
- `public/icons/` – ikony PWA (icon-96/192/512, maskable, apple-touch) a `splash/` (31 obrazovek iOS, každá světlá a `-tmava`), generuje `scripts/build-icons.mjs`; vedle `public/og-image.png` (náhled odkazu, `scripts/build-og-image.mjs`).
- `public/data/pretrip.json` – data Před cestou (EHIC, DROZD, řidičák, zásuvky, telefony; ověřeno 2026-10), čte `public/js/pretrip.js`, v PRECACHE.

## Data a skripty

| Soubor | Obsah | Čte | Sestaví | Zdroj a licence |
|---|---|---|---|---|
| `data/airport-pax.json` | { IATA: [tisíce cestujících, rok] }, ~2 970 letišť | `server/lib/airports.js` (PAX) | `scripts/build-airport-pax.mjs` | Wikidata P3872, CC0 |
| `data/airports.json` | ~4 000 letišť: [iata, název, město, cc, lat, lon, typ L/M/S, tz] | `server/lib/airports.js` | `scripts/build-airports.mjs` | OurAirports (public domain) + OpenFlights (ODbL) |
| `data/arrival.json` | letiště → město MHD (157 letišť), pevné taxi, kurzy ČNB | `server/lib/arrival.js` | ručně (src, date) | ceníky letišť, dopravců a svazů |
| `data/climate.json` | cells, airports, stations, near (1 MB na 1 řádku) | `server/lib/climate.js` (líně) | `scripts/build-climate.mjs` → `scripts/build-climate-stations.mjs` | NOAA NCEI / GHCN-Daily, NASA POWER |
| `data/countries.json` | 197 zemí: cs, cont, cap, cost, safety, months, cur, capLL… | `server/lib/airports.js`; prohlížeč `/data/countries.json` → `public/js/app.js` | ručně; capLL `scripts/build-capitals.mjs` | Světová banka, MZV ČR, FCDO; GeoNames CC BY 4.0 |
| `data/entry.json` | vstupní podmínky pro občany ČR, 197 zemí | prohlížeč `/data/entry.json` → `public/js/entry.js` | ručně (checked) | MZV ČR, weby e-víz, WHO, CDC |
| `data/ground.json` | města RegioJetu a UUID FlixBusu (262 měst, 234 zastávek) | `server/lib/ground.js` | `scripts/build-ground.mjs` | RegioJet API, FlixBus jen UUID pro odkazy |
| `data/places.json` | ~161 tis. míst, kódované řádky (7,8 MB) | `server/lib/places.js` `loadPlaces()` | `scripts/build-places.mjs` | GeoNames, CC BY 4.0 |
| `data/regions.json` | hranice 10 oblastí, [lon, lat], 1 řádek | `server/lib/regions.js` | `scripts/build-regions.mjs` | OpenStreetMap / Nominatim, ODbL |
| `data/sight-hours.json` | zavírací dny 55 nejnavštěvovanějších památek | `server/lib/hours.js` | ručně (src, checked) | oficiální weby památek |
| `data/transfers.json` | pravidla přejezdů: regions, rail, openBorders, border, congestion, hsr, railLinks | `server/lib/transfers.js` | ručně (README ## Přejezdy mezi místy) | jízdní řády 2026 |
| `public/data/pretrip.json` | Před cestou: EHIC, DROZD, řidičák, zásuvky, telefony | `public/js/pretrip.js` | ručně (checked) | MZV, VZP, KZP |

Skripty (vše `node scripts/…`; README ## Data a licence má příkazy pro aktualizaci):
- `scripts/build-airports.mjs` – `data/airports.json`; `npm run build:airports` [a.csv b.dat]; síť GitHub (OurAirports, OpenFlights), offline z lokálních souborů; `parseCSV()` sdílí další skripty.
- `scripts/build-airport-pax.mjs` – `data/airport-pax.json`; `node scripts/build-airport-pax.mjs [pax.csv]`; Wikidata SPARQL; `paxTable()`.
- `scripts/build-capitals.mjs` – capLL do `data/countries.json`; `node scripts/build-capitals.mjs [--cache dir]`; GeoNames cities15000; spustí se už importem (top-level await).
- `scripts/build-climate.mjs` – buňky NASA v `data/climate.json`; `node scripts/build-climate.mjs [--resume]`; ~3 800 dotazů (~15 min); pak vždy stanice.
- `scripts/build-climate-stations.mjs` – stanice WMO/GHCN do `data/climate.json`; `node scripts/build-climate-stations.mjs [--cache DIR]`; NOAA ~560 MB; `fillGaps()`, `MANUAL`, `OVERRIDE`.
- `scripts/build-ground.mjs` – `data/ground.json`; `npm run build:ground` [--max 400] [--fresh]; RegioJet; UUID FlixBusu jen pevně z dřívějších dat (z FlixBusu nic nestahuje); `main()` běží už importem.
- `scripts/build-places.mjs` – `data/places.json`; `node scripts/build-places.mjs [--cache <adresář>]`; GeoNames ~630 MB; `selectPlace()`, `pickName()`, `MUST`, `mustFind()`.
- `scripts/build-regions.mjs` – `data/regions.json`; `NODE_USE_ENV_PROXY=1 node scripts/build-regions.mjs [klíč…]`; Nominatim; nová oblast i do `server/lib/names.js` REGIONS.
- `scripts/build-icons.mjs` – `public/icons/*.png` (hotová PNG z balíku identity Letsi `ikona/` kopíruje beze změny, zbylé velikosti dopočítá) a blok `<!-- ios-splash -->` v `public/index.html`; `npm run build:icons`; bez sítě.
- `scripts/build-og-image.mjs` – `public/og-image.png` v identitě Letsi; `npm run build:og`; globální Playwright + Chromium, písma Unbounded a Onest z `public/vendor/fonts/letsi` (bez sítě); otisk `ogSource()`.
- `scripts/letsi-znak.svg` – znak kukátka v pozitivu (balík identity, `znak/`) pro náhledový obrázek.
- `scripts/load-test.mjs` – zátěžový test vlastního DEMO serveru (fáze health, static, search-*, users); `node scripts/load-test.mjs` (env ONLY, USERS, CPU_QUOTA…); bez sítě, nikdy proti produkci; výsledky do `docs/skalovani.md`.

## Testy
- Vše: `npm test` (= `node --test test/*.test.js`, ~90 s); jeden soubor: `node --test test/x.test.js`; jeden test: `node --test --test-name-pattern="část názvu" test/x.test.js`.
- Spouští se jen `test/*.test.js` přímo v test/, každý soubor ve vlastním procesu; nový test pojmenuj `*.test.js`.
- Serverový test: `process.env.ATLAS_MOCK='1'` před importem, `createServer()` ze `server/index.js`, `listen(0, '127.0.0.1')` (vzor níže označený „vzor serveru“).
- Klientský test: `vm.runInNewContext(readFileSync('public/js/X.js'), { window: {} })` → `ctx.window.X` (vzor níže označený „vzor klienta“); objekty z vm před `assert.deepEqual` převeď přes JSON.
- Pomocníci: `test/helpers.js` (`stubFetch()` → `restore()`, `ymdPlus()`), `test/qrdecode.js` (`decode()`, `fromSvg()`), `test/fixtures/` (ryanair, regiojet, czso, wob-…xlsx, xotelo, wikidata, daytrips, program-cities, hike-krkonose, places-bcn, trips-now, timeline-golden.json, geonames-mini.zip).
- Lety – zdroje a orchestrace: `test/providers.test.js`, `test/kiwi.test.js`, `test/search-live.test.js`, `test/search-tp.test.js`, `test/exact.test.js`, `test/departed.test.js`, `test/errtext.test.js`, `test/fx.test.js`, `test/baggage.test.js`, `test/pax.test.js`
- Lety – skládání a cena: `test/engine.test.js`, `test/kamkoliv-mix.test.js`, `test/kamkoliv-mixpool.test.js`, `test/multi.test.js`, `test/longhaul.test.js`, `test/hubs.test.js`, `test/roundtrip-link.test.js`, `test/dategrid.test.js`, `test/dst.test.js`, `test/pricecheck.test.js`
- Radar a nával: `test/radar.test.js`, `test/radar-slim.test.js`, `test/swr.test.js`, `test/crowd.test.js`, `test/crowd-client.test.js`, `test/scale.test.js`, `test/overload-client.test.js`
- Server – HTTP, bezpečnost, PWA, SEO: `test/server.test.js` (vzor serveru), `test/security.test.js`, `test/seo.test.js`, `test/pwa.test.js`, `test/startup.test.js`, `test/lazy.test.js`, `test/scriptload.test.js`
- Server – další služby: `test/clienterr.test.js`, `test/pocitadla.test.js`, `test/mikro-otazky.test.js`, `test/about.test.js`, `test/shortlinks.test.js`, `test/invite-link.test.js`, `test/weather-met.test.js`, `test/photos.test.js`, `test/mapy.test.js`
- Doprava: `test/access.test.js`, `test/applinks.test.js`, `test/arrival.test.js`, `test/fuel.test.js`, `test/fuel-api.test.js`, `test/ground.test.js`, `test/ground-api.test.js`, `test/ground-ui.test.js`, `test/transfers.test.js`
- Místa a našeptávač: `test/suggest.test.js`, `test/places-search.test.js`, `test/places-missing.test.js`, `test/czech-names.test.js`, `test/nature.test.js`, `test/places-ui.test.js`, `test/objevuj-poradi.test.js`, `test/objevuj-drobnosti.test.js`
- POI, výlety, program, túry: `test/poi.test.js`, `test/country.test.js`, `test/daytrips.test.js`, `test/regions.test.js`, `test/roadtrip.test.js`, `test/itinerary.test.js`, `test/program.test.js`, `test/hours.test.js`, `test/hikeplan.test.js`, `test/hikeplan-ui.test.js`, `test/trailhead.test.js`, `test/bike.test.js`
- Ubytování a serverový plánovač: `test/xotelo.test.js`, `test/liteapi.test.js`, `test/osm.test.js`, `test/partnerids.test.js`, `test/stays-ui.test.js`, `test/trip.test.js`
- Průvodce a trasa přes víc míst: `test/stayplan.test.js`, `test/stayplan-nights.test.js`, `test/stayplan-openjaw.test.js`, `test/trip-auto.test.js`, `test/cesta-shrnuti.test.js`, `test/trip-car.test.js`, `test/trip-changes.test.js`, `test/trip-fly.test.js`, `test/trip-integration.test.js`, `test/trip-legs.test.js`, `test/trip-next.test.js`, `test/trip-route.test.js`
- Moje cesty: `test/trip-edit.test.js`, `test/plan-nav.test.js`, `test/plan-update.test.js`, `test/planner-stay.test.js`, `test/mytrips.test.js`
- Na cestě a před cestou: `test/ontrip.test.js`, `test/ontrip-rides.test.js`, `test/pretrip.test.js`, `test/entry.test.js`, `test/weather.test.js`, `test/ics.test.js`
- Lety v prohlížeči: `test/lety-form.test.js`, `test/drobnosti-lety.test.js`, `test/lety-filters.test.js`, `test/lety-detail.test.js`, `test/searchhelp.test.js` (vzor klienta), `test/holiday.test.js`, `test/daycal.test.js`, `test/spancal.test.js`, `test/rank.test.js`, `test/smart.test.js`, `test/smart-diacritics.test.js`, `test/draft.test.js`, `test/pax-ui.test.js`
- Přehled, hlídání, uložený stav: `test/alerts.test.js`, `test/buytip.test.js`, `test/pins.test.js`, `test/since.test.js`, `test/tips.test.js`, `test/migrate.test.js`, `test/recs.test.js`, `test/world-trips.test.js`
- Sdílení, záloha, přenos: `test/sharelink.test.js`, `test/sharecard.test.js`, `test/offershare.test.js`, `test/share-codes.test.js`, `test/backup.test.js`, `test/transfer.test.js`, `test/qr.test.js`
- ⭐ Plus (falešné dveře, počítání cest, otázka na cenu, karta sešitu): `test/plus.test.js`
- „Mám letenku“, „Koupeno?“ a zapojení počítadel (každá událost na jednom místě): `test/mam-letenku.test.js`
- Vzhled, přístupnost, telefon a počítač: `test/a11y.test.js`, `test/css-ph.test.js`, `test/dark-visual.test.js`, `test/vzhled-letsi.test.js` (výchozí vzhled Letsi a nouzová cesta ?vzhled=atlas, manifest, offline sada, pravidla letsi.css), `test/kukatko.test.js` (kukátko: stavy z DOM, jedno slunce, omezený pohyb, usínání ve tmě), `test/desktop.test.js`, `test/desktop-trip.test.js`, `test/modal-scroll.test.js`, `test/phone-text.test.js`, `test/phone-visual.test.js`, `test/theme.test.js`, `test/history.test.js`, `test/newcomer.test.js`
- Data, skripty a tahle mapa: `test/data.test.js`, `test/climate.test.js`, `test/places-build.test.js`, `test/mapa.test.js`

## Nasazení a nastavení
- `render.yaml` – Render Blueprint: web, runtime node, plan free, frankfurt, build `npm install`, start `node server/index.js`, healthCheckPath `/healthz`, NODE_VERSION 22; komentáře na konci = seznam klíčů pro Environment (PORT nenastavovat).
- `.github/workflows/deploy.yml` – „Testy a nasazení“: `npm test` na Node 22 u každého PR, push do main a ručně (workflow_dispatch); po zelených testech na main job deploy `curl -X POST` na secret RENDER_DEPLOY_HOOK (bez secretu jen warning). Tohle je skutečný spouštěč nasazení.
- `.github/workflows/claude-agent.yml` – Claude přes Agent SDK (`.github/claude/agent.mjs`): `@claude` v issue (jen OWNER/MEMBER/COLLABORATOR), ruční úkol a denní kontrola (po 2026-11-05 stojí, krok „Spustit?“); bez secretu ANTHROPIC_API_KEY nic nespustí; PR pak `gh workflow run deploy.yml --ref <větev>`.
- `Dockerfile` – alternativní kontejner node:22-alpine (`package.json`, server, public, data; USER node; PORT 8080); Render ho nepoužívá.
- `package.json` – skripty `start`, `dev` (--watch), `demo` (--demo), `test`, `build:airports`, `build:ground`, `build:icons`, `build:og`; žádné závislosti, type module, engines >=20 (reálně Node 22).
- Konfigurace: `server/config.js` čte env a volitelný `.env` (v .gitignore, env má přednost); seznam proměnných v README ### Nastavení (`.env`, volitelné). Mimo `server/config.js`: CACHE_SOFT_MB (`server/lib/cache.js`), PARTNER_LOOKUP (`server/lib/partnerids.js`), RENDER (`server/lib/security.js`), BROUTER_URL a BROUTER_GAP_MS (`server/lib/brouter.js`), FUEL_LIVE a FUEL_TIMEOUT_MS (`server/lib/fuel.js`), MAPY_API_URL (`server/lib/mapy.js`), OVERPASS_URL (`server/lib/hikeplan.js`), REGIOJET_LIVE, REGIOJET_GAP_MS, REGIOJET_MAX_PER_HOUR (`server/lib/ground.js`).
- `STATS_KEY` (`config.statsKey`): klíč k `/api/stats`, `/api/traces` a stránce Statistiky; bez něj jsou počty veřejné (server to při startu vypíše) a záznamy návštěv nejdou číst vůbec (404).
- Kontrola produkce: jen `/healthz`, `/api/health` (zdroje, kurzy, fronta, mapy) a `/api/places`; nikdy `/api/search`; `/api/diag` jen výjimečně (živé dotazy ven).
- DEMO: `npm run demo` (= `--demo`, nebo ATLAS_MOCK=1) → `config.mock`: lety z `server/providers/mock.js`, hotely z `server/providers/stays/demo.js`, mock* v `server/lib/poi.js`, `server/lib/bike.js` a `server/lib/hikeplan.js`, pevné ceny paliva, předpověď null, Mapy.com vypnuté, krátké odkazy v paměti, `/api/verify` available:false; geokódování z `data/places.json` funguje, kurzy se zkusí stáhnout.
- Render free (0,1 CPU, 512 MB, usíná po 15 min) → výchozí SEARCH_CONCURRENCY 4, SEARCH_QUEUE 20, CACHE_SOFT_MB 320; ladění při růstu `docs/skalovani.md`.
- Dokumenty: `README.md` (~2 070 ř., číst po oddílech), `CLAUDE.md`, `docs/skalovani.md`, `docs/placene-planovani.md` (jen návrh), `docs/identita/` (přejmenování na Letsi, tón textů), `docs/pravni/` (návrh zásad ochrany osobních údajů a podmínek užívání), `legacy/ATLAS-puvodni.html` (nic ho nenačítá).

## Pozor

### Pravidla a produkce
- Na produkci nevolat `/api/search` ani `/api/diag` (ostré dotazy na aerolinky). Otevřený Přehled s domovem spouští radar (`renderRadar()` → `runSearch()`) a otevřená záložka kontroluje hlídání – zkoušej v `npm run demo`.
- Nic placeného: zdroje letů zdarma (Ryanair a Wizz web API, Kiwi MCP, Travelpayouts token), Mapy.com jen z volných kreditů se stropem MAPY_MAX_PER_HOUR; klíče jen v env na Renderu, nikdy v `public/` ani v gitu.
- FlixBus jen odkazy (`server/lib/ground.js` `links()`, `public/js/ground.js`, `scripts/build-ground.mjs` z FlixBusu nic nestahuje) – ceny ani stránky nikdy. RegioJet API jen ze serveru (z prohlížeče 403), REGIOJET_LIVE=0 vypne, max 60/h.
- Žádné push ani keep-alive: hlídání a `checkVersion()` běží jen při otevřené stránce, Notification až po klepnutí (`askNotif()`); náhradou je 🕘 Od minula.

### Server a API
- Router je řetězec if v `route()` a na pořadí záleží: `/api/search` a `/api/tiles/mapy/` jsou na konci, pak catch-all 404 JSON. POST-only endpointy na GET vrátí 404 „Neznámý endpoint“, ne 405 (405 mají jen `/api/client-error`, `/api/count` a `/api/share`).
- Klient volá API relativně (`'api/…'` bez lomítka) – volajícího hledej `grep -rn "api/název" public/js`, ne `/api/`.
- Každé `/api/*` má `API_CSP`; Sec-Fetch-Site: cross-site (mimo navigaci) → 403. curl a testy bez té hlavičky projdou.
- Limity jsou jen v paměti procesu (`RateLimiter`, okno 10 min; clientErrs a shareHits 1 h) podle `clientIp()` (na Renderu CF-Connecting-IP); restart a nasazení je vynuluje; 429 nese Retry-After.
- Sdílený limit hits (SEARCH_RATE_LIMIT 40/10 min): `/api/search`, `/api/stays`, návrh `/api/stayplan`, živý RegioJet v `/api/ground`, `/api/diag`.
- Objevuj (EXPLORE_RATE_LIMIT) počítá jen dotazy mimo mezipaměť (z mezipaměti 5× víc); kolo, pěšky a túry až první cache miss → nový síťový dotaz v `server/lib/bike.js` nebo `server/lib/hikeplan.js` musí volat `q.onMiss`.
- Změníš klíč nebo volby `findPlaces()`, `findTrips()`, `countryHighlights()` → uprav i placesKey/tripsKey/countryKey/countryCatKey (funkce *Cached), jinak limit Objevuj počítá špatně.
- Některé limity neodmítají, jen ubírají: stayplan s bases bez nových tras, ground jen odhad, weather bez nových dotazů na MET, geocode bez Mapy.com.
- `/api/places`, `/api/climate` a `/api/nature` nemají limit, protože nejdou do sítě – nepřidávat do nich síťové dotazy.
- `/api/nearby` volá jen `test/server.test.js` – před změnou nebo odstraněním ověř.
- POST endpointy jinou metodou → 405 s `Allow: POST` (`POST_ONLY` v `server/index.js`) – nový POST endpoint tam dopiš. lat/lon z adresy přes `coordOf()` (prázdné ≠ 0), data z těla přes `realYmd()` (2027-02-30 neprojde).
- Vyhledání v obyčejném objektu podle vstupu uživatele jen přes `Object.hasOwn()` (`__proto__`, `constructor` by jinak našly Object.prototype → 500).
- Chyby: `HttpError` → 503 česky bez URL; `UserError`, `StayPlanError`, `GroundError`, `StayQueryError`, `CarQueryError` (status 400) → jejich text; jiné → 500 obecně, detail jen do logu. `request()` opakuje jen 5xx a síť; 429 jen s volbou `retry429` (Wikimedia, Retry-After ≤ 10 s), u aerolinek nikdy.
- Server poslouchá jen jako vstupní skript (process.argv[1]); testy importují `createServer()` bez startu. `server/config.js` čte env při importu → testy nastaví process.env a pak importují dynamicky.
- Neplatné FEEDBACK_EMAIL, SUPPORT_URL (jen https://buy.stripe.com/…), OPERATOR a PUBLIC_URL se tiše zahodí; osobní údaje provozovatele jen v env.

### Hledání letů
- Tělo `/api/search` je klíč sdílení i mezipaměti (`searchKeys()`: celé tělo kromě newerThanS + dnešek) – proměnlivé pole v dotazu (např. v `radarQuery()`) by obojí rozbilo. Výsledek s výpadkem nebo neúplným coverage se jako hotový neuloží (`completeResult()`).
- Cena a pořadí = perPersonCzk (letenka + zavazadla); doprava na letiště, parkování a cesta do města jsou jen v tripCzk (`rankGround = () => 0`). Komentář u `arrOf` v `search()` je zastaralý.
- Všechny mezipaměti jsou v RAM (`server/lib/cache.js`, paměť tras Wizz, pojistky po 429, store počasí, fotky) – restart, nasazení i uspání je smaže; první Objevuj pak čeká na Wikidata až ~1 min.
- Jedno vlákno a 0,1 CPU: dlouhé smyčky po kouscích `const w = breathe(); if (w) await w;` (`server/lib/crowd.js`), jinak stojí i `/healthz` a našeptávač.
- mix* musí dát totéž jako všechny lety najednou (`test/kamkoliv-mix.test.js`, `test/kamkoliv-mixpool.test.js`); konečný výsledek musí být stejný s náhledy i bez (noPartial).
- Radar dostává zmenšený výsledek: pole, které radar nově čte, přidej do RADAR_DEST/RADAR_TRIP/RADAR_LEG v `server/lib/search.js` (`test/radar-slim.test.js`); buňky mřížky jdou kompaktně (`cellRows()` ↔ `public/js/searchhelp.js` `cellTrips()`).
- Po 429 se zdroj na chvíli vynechá (Ryanair Retry-After nebo 2 min, Wizz 10 min, Kiwi 1–3 min). Wizz nemá Kamkoliv: max WIZZ_MAX_CALLS na hledání, zbytek z paměti ≤ 6 h → tlačítko Prohledat zbylé trasy (coverage).
- Cestující: Ryanair a Kiwi ceny za osobu (Kiwi jen dospělí, price / adults), Wizz počítá děti jako sedadla, Travelpayouts v odkazu jen dospělí. Travelpayouts = cache ~48 h (live:false), zpáteční combined do mix nejde.
- dep/arr jsou místní časy bez zóny, 'T00:00' = neznámý čas (hasTime false); převod jen `localToUtcMs()` se zónou letiště. Dnešek v UTC (`todayYmd()`), hledání ≤ 360 dní, vyřadí se odlet do 120 min (`departedSoon()`) a návrat < 2 h po příletu (`returnFits()`).
- Demo zdroje mají id 'demo-air' a 'demo-jet' – výčty zdrojů (PROVIDER_INFO, LOWCOST v `nearbyDays()`) s nimi musí počítat. `server/lib/baggage.js` je odhad (10/2026), ne ceník.

### Zrcadla a importy
- Měnit obě strany: `server/lib/pricelevel.js` ↔ `public/js/pricecheck.js` (`levelOf()`); `server/lib/access.js` (CAR_FUELS, `carEnergy()`, `parkStay()`, `parkCzk()`, `carTrip()`, `normalizeOwn()`) ↔ `public/js/searchhelp.js`; `server/lib/ground.js` `planeOptions()`/`worth()` ↔ `public/js/ground.js`.
- Další zrcadla: `server/lib/search.js` `paxQuery()`/`topWithDays()`/`roundTripUrl()` ↔ searchhelp `paxOf()`/`legSig()`/`roundBookUrl()`; `server/lib/optimizer.js` `returnFits()` ↔ searchhelp; `server/lib/stayplan.js` TRANSFER_MAX ↔ `public/js/trip.js`; ACCESS ↔ `data/arrival.json` (`test/arrival.test.js`); `public/js/app.js` `migratePrices()` pv 2 ↔ `public/js/alerts.js` PV.
- Kruhy importů: `server/lib/places.js` → `server/lib/access.js` → `server/lib/ground.js` → places.js (v access.js nic z ground.js na nejvyšší úrovni); `server/lib/daytrips.js` → `server/lib/transfers.js` → `server/lib/bike.js` → `server/lib/poi.js` (hodnoty z daytrips.js číst až za běhu).
- Stejná jména, jiný význam (krátké názvy = `server/lib/…`): `tollCzk()` (stayplan.js za km × access.js známky), `estimate()` (ground.js × transfers.js), `driveMin()` (access.js, roadtrip.js, `public/js/places.js`), `transitMin()` (itinerary.js, roadtrip.js), MAX_KM (ground.js, partnerids.js, `server/providers/stays/osm.js`), UA (brouter.js, poi.js, fuel.js), REGIONS (`server/lib/names.js` rg: s letišti × `server/lib/regions.js` hranice), `suggestRoute()` a `checkStay()` (server i `public/js/trip.js`), `packFor()` (`public/js/backup.js` lokální × `public/js/data.js`).

### Prohlížeč
- `public/js/app.js` není IIFE: jeho globály ($, `esc()`, `safeUrl()`, `czk()`, S, `save()`, `go()`, `toast()`, `modalOpen()`…) používají všichni; function deklarace jsou na window, const/let ne. Ostatní moduly jsou IIFE s window.X (`public/js/flights.js` ven jen `window.Flights` a `window.showSetupGuide`).
- Pořadí `<script>` v `public/index.html` je závazné (z `public/js/` searchhelp, alerts, rank, smart, pins a pricecheck před `public/js/flights.js`); nový soubor stačí přidat do `public/index.html`, precache a ?v= udělá `server/lib/pwa.js`.
- Líné moduly sharecard, pretrip, places, trip (data-later v `public/js/lazy.js`) nesmí mít vlastní `<script>`; volat přes `withMod()`, `lazyView()` (`public/js/app.js`), `Lazy.need()` nebo `Lazy.run()`, jinak je Trip/Places undefined. `public/js/pwa.js` je defer → `window.Pwa && …`.
- CSP: žádné onclick=, onload= ani javascript: (obsluha přes data-* v JS); vložené `<script>` se povolí samy přes sha256; nový cizí host pro fetch z prohlížeče do `CONNECT` (`server/lib/security.js`, teď jen dlaždice OpenFreeMap a OSM; kurzy jdou přes `/api/fx`); obrázky z libovolného https; písma jen z vlastního serveru (font-src 'self').
- Klíče localStorage nepřejmenovávat: atlas_v1 (stav S), atlas_last, atlas_draft, atlas_prices_v1, atlas_explore_v1, atlas_pretrip_v1, atlas_budget, atlas_wn, atlas_wn_top, atlas_since, atlas_tip, atlas_plancard, atlas_nowwx, atlas_ph9, atlas_flags. Změna atlas_v1 → migrace v `load()`/`migratePrices()` (pv).
- `save()` při plném úložišti smaže atlas_last a zkusí znovu (false až když ani to nejde); událost storage (`wireEvents()`) přebírá změny z jiného panelu kromě watch (slučuje `Alerts.mergeWatches()`) – S.watch nepřepisovat naslepo.
- Cizí vstup jen přes sanitizéry: #trip= `sanitizeTrip()`, #plan= `PlanShare.sanitize()`, #offer= `OfferShare.sanitize()`, #jed= `ShareCard.sanitize()`, záloha a #sync= `Backup.parse()`, `Pins.clean()`, `PreTrip.mergeDone()`; nové pole přidat i tam.
- Kódy rezervací (refs) ani kód jízdenky (rides[].kod) nikdy do odkazu, `/api/share`, #jed= ani .ics (`test/share-codes.test.js`).
- Identita cesty: S.trip.created = S.trips[].tripId; tvar PreTrip `tripKey()` a Pins `basis()`/`rowKey()` neměnit. `persist()` = `save()` + `autoSoon()`, `saveToPlanner({quiet})` volá jen `save()`.
- Pozdní odpovědi se zahazují podle pořadových čísel (exSeq, replanSeq, smartSeq, routeSeq, carSeq, pickSeq, painters) – vzor dodržet.
- Výpis Letů: kliky se navěšují po každém `renderResults()` ve `wireResults()`/`wireHelp()` (ne delegací); data-pick/pc/live/pin jsou indexy do rowRegistry (stálý klíč data-tid); nepřekreslovat pod rukou (`paintSoon()`, `rerenderKeep()`); průběžný výsledek se neukládá.
- Desítky testů čtou zdroj regexem nebo vyřezávají kód podle textových značek (`test/lety-form.test.js`, `test/history.test.js`, `test/tips.test.js`…) – přejmenování či přeformátování v `public/js/app.js`, `public/js/flights.js` nebo `public/index.html` může shodit `npm test`; před refaktorem grepni název v test/.
- Čistá logika bez DOM a sítě (searchhelp, smart, rank, recs, pricecheck, alerts, since, pins, qr, offershare) se testuje v node:vm – DOM ani fetch tam nepřidávat; oprava logiky = test.
- WHATS_NEW: nová položka na začátek pole; WN_ID se porovnává jako text → nové musí být větší řetězec (datum); jen u nových funkcí.
- Desktop CSS jen v `public/css/desktop*.css` uvnitř přesně `@media (min-width:1024px)` (`test/desktop.test.js`); `public/css/atlas.css` má starou výjimku `@media(min-width:1081px)`, další nepřidávat. Světlý režim je laděný na kontrast ≥ 4,5:1.
- Nezlomitelné mezery (U+00A0) mezi číslem a jednotkou a v datech zachovat.
- `Smart.parse()`: max 200 znaků, pořadí pravidel rozhoduje, bez lookbehind (staré Safari); nový obrat = test v `test/smart.test.js`.
- Safari dovolí schránku a navigator.share jen přímo v obsluze klepnutí → odkazy připravit předem (`ShareLink.prepare()`, karty `render()` hned po otevření okna).
- Fotky: změna výběru = nová verze klíče na serveru (teď ph7 v `server/lib/photos.js`) i v klientu (atlas_ph9 a `api/photos?v=4` v `public/js/app.js` a `public/js/sharecard.js`).

### PWA, statika, sdílení
- `public/sw.js` musí mít na jednom řádku `const BUILD = '…';` a `const PRECACHE = […];` (jinak `/sw.js` vrátí 500); `public/index.html` blok `<!-- brand: …`…`<!-- /brand -->` a meta atlas-build. Bloky brand a ios-splash ručně needitovat.
- Build = otisk celého public/ + RUNTIME_ASSETS + BRAND + PUBLIC_URL → každá změna v public/ (i obrázek) = nový SW a lišta „nová verze“. ?v= dosazuje server, ručně ho nepiš; skryté soubory se neposílají; d3 a MapLibre (data-files) nejsou v PRECACHE.
- Z `data/` jdou přes HTTP jen `data/countries.json` a `data/entry.json`; `public/data/pretrip.json` jde jako běžný soubor z public/; ostatní data zná jen server.
- html/js/css jdou s no-cache (levné 304 přes ETag), immutable na rok jen s ?v= shodným s obsahem. /c/ a /j/ mají X-Atlas-Build: preview a robotům (PREVIEW_BOT) se neposílá meta refresh.
- Krátké odkazy jen s UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (DEMO = paměť); bez nich `/api/share` 503, /c/ 404 a aplikace pošle dlouhý odkaz. Strop Upstash 500 000 příkazů/měsíc šetří `cachedStore()` a shareGets.
- Počítadla (`/api/count`) se o strop Upstash dělí s krátkými odkazy: do úložiště se nepíše při každé události, ale jednou za 30 min po dávkách (`makeCounter()` → `flush()`, i při SIGTERM). Nová událost = doplnit na konec `EVENTS` (strop 150 a rozpočet hlídá test) a doslova do `public/js/statistiky.js`; počet, který dělá server sám, i do `SERVER_EVENTS`; nikdy k ní neukládat adresu, zařízení ani identifikátor (slib v O aplikaci, `test/pocitadla.test.js`). Podrobné počty z aplikace jen přes `window.Count && Count.deep && Count.deep('…')` – bez souhlasu se neposílají (`test/traces.test.js`).
- Data za # se na server neposílají a errlog je maže; na serveru se ukládá jen cesta/plán krátkým odkazem (400 dní) a jen po vědomém sdílení, a souhrnné denní počty událostí (400 dní, bez osobních údajů).
- Po změně `server/brand.js` nebo šablony `ogHtml()` (`scripts/build-og-image.mjs`) spusť `npm run build:og`, jinak padá `test/seo.test.js`; ikony jen přes `npm run build:icons` (`test/pwa.test.js`); manifest je bez name záměrně.

### Cizí služby
- Mapy.com: nic neukládat (podmínky 4.6.2) – dlaždice no-store, návrhy ani trasy do `server/lib/cache.js`; klíč jen v hlavičce X-Mapy-Api-Key na serveru; návrhy src 'mapy' musí mít v klientu logo (`mapyBy()`).
- Veřejné služby: Nominatim max 1/s (`server/providers/stays/osm.js`), BRouter 1 naráz s 1 s mezerou a frontou 20 (sdílená kolem i přejezdy), Overpass po chybě 10 min pauza, Wikidata snesou ~5 souběžných dotazů z IP – nepřidávat fronty. Wikimedia chce popisný UA (`server/lib/poi.js` UA).
- MET Norway jen přes server: UA s odkazem, ukládat podle Expires (≥ 3 h), < 20 dotazů/s, polohy na 2 desetinná místa. Open-Meteo je pryč (zdarma jen nekomerčně) – nevracet.
- Neoficiální zdroje: Xotelo (TripAdvisor) a z něj `server/providers/stays/ta-places.js`; XOTELO=off ho vypne (zůstanou odkazy a ubytování z OSM bez ceny); testovací klíč LiteAPI sand_… se v ostrém provozu nepoužije.
- Affiliate (tp.media) jen s číselnými TRAVELPAYOUTS_MARKER i TRAVELPAYOUTS_TRS, jinak přímé odkazy; tvary URL v `server/lib/links.js` jsou ověřené v Chromu – neměnit naslepo.
- Ceny hotelů jen do 30 nocí (dotaz 1–45); Xotelo i LiteAPI v EUR → Kč přes `server/lib/fx.js`, rate Xotela je za pokoj a noc; neúplný výsledek se drží jen 5 min.
- Odhady v `server/lib/access.js`, `server/lib/ground.js`, `server/lib/transfers.js` a `server/lib/stayplan.js` jsou kalibrované na ručně ověřených cenách (10/2026) – měnit jen s novým ověřením, komentářem i README.
- `server/lib/fuel.js`: komentáře o 6 zemích jsou zastaralé (COUNTRIES = 27 zemí EU); hledání nesmí čekat na síť → `fuelPrice()`/`carFuelCzk()`, ne `fuelInfo()`.

### Data, skripty, testy
- Nečti celé: `data/places.json` (7,8 MB), `data/climate.json` a `data/regions.json` (1 řádek), `server/providers/stays/ta-places.js`; tvar zjisti přes `node -e`. `data/places.json` je kódovaný – ručně neupravovat, jen `scripts/build-places.mjs`.
- V `data/` mají countries, airports, airport-pax a places jeden záznam na řádek (malé diffy). Ruční data (arrival, entry, sight-hours, transfers, countries) vždy se zdrojem a datem; v `data/arrival.json` měna = země letiště (`test/data.test.js`).
- `scripts/build-capitals.mjs` a `scripts/build-ground.mjs` se spustí (stahují a zapisují) už při importu; po `scripts/build-climate.mjs` vždy `scripts/build-climate-stations.mjs`.
- `test/security.test.js` na chvíli zapíše `public/.atlas-test-skryty-<pid>.txt`; po přerušení testu může zůstat.
- Nasazení: `render.yaml` má autoDeployTrigger commit, ale nasazuje job deploy z `.github/workflows/deploy.yml` až po zelených testech na main.
