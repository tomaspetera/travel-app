# Škálování ATLAS – co snese jeden server zdarma a co ne

Podklad k podnikatelskému plánu (cíl: 1000+ lidí naráz, později desítky tisíc uživatelů). Stav k 24. 10. 2026.

## Starší výsledek radaru hned, přepočet na pozadí (24. 10. 2026)

Navazuje na „Další kroky“ bod 5. Na Renderu zdarma (0,1 CPU) trvá výpočet radaru při návalu minuty (níž: p50 141–157 s
pro 10 návštěvníků). Hotový výsledek server drží jen 2 min (`SEARCH_RESULT_TTL`) – kdo přišel později, čekal na celý
nový výpočet, i když stejný radar server spočítal před pár minutami pro někoho jiného.

### Jak to funguje (server/index.js revalidate, server/lib/crowd.js recentResults, public/js/flights.js radarSearch)
- **Co se drží**: jen úplný výsledek radaru (`radar: true`, completeResult) – po 2 min dál jako „starší“, nejvýš 30 min
  od spočítání (`SEARCH_STALE_TTL` v s, výchozí a zároveň nejvýš 1800 – aplikace radar starší 30 min sama hledá znovu,
  starší by jí nebyl k ničemu; 0 = vypnuto, chování jako dřív). Ve stejném stropu paměti `SEARCH_RESULT_MB` (radar
  ~1,2–1,4 MB, 24 MB ≈ 17 radarů): při nedostatku místa ven nejdřív prošlé, pak nejstarší. Hledání v Letech se nemění
  (hotový výsledek jen 2 min, starší nikdy).
- **Klíč** = celé tělo dotazu a dnešní datum serveru: domov (letiště), okruh, režim Kdykoliv / Víkendy / Svátky (noci,
  dny odletu a návratu, odlet od, termíny), počet lidí, cesta na letiště i 🏠 vlastní ceny. Nic proměnlivého (čas,
  náhodné číslo) aplikace neposílá (SearchHelp.radarQuery), takže radar z Prahy +200 km pro 2 os. sdílí každý se stejným
  nastavením. Přes půlnoc nepřejde (dotaz „od dneška“ se mění).
- **Kdo přijde po 2 min**, dostane hned starší výsledek se značkou `{ type: 'result', stale: { at, ageS }, result }` –
  bez průběhu, i když se stejné hledání právě počítá, i při plné frontě (frontu ani strop adresy nezabere, do limitu
  hledání z adresy se počítá jako hotový výsledek). Server výsledek znovu na JSON nepřevádí, jen změní začátek řádku.
  Aplikace uloží radar s časem spočítání (podle `ageS` serveru, ne hodin telefonu) a v patičce ukáže
  **„Aktualizováno 12:18 (před 12 min)“** – stáří u každého radaru staršího 2 min, i uloženého; za otevřené aplikace
  se každou minutu a po návratu do aplikace dopočítá (jen text, žádné hledání). Paměť cen (⭐, „Je to dobrá cena?“) ceny
  zapíše k času spočítání. 30min platnost uloženého radaru v aplikaci běží od spočítání – po ní hledá znovu a dostane
  už nový výsledek.
- **Přepočet na pozadí**: kdo starší výsledek dostane, spustí jeden přepočet – obyčejné sdílené hledání (fronta, strop
  souběžných hledání; připojí se k němu i ↻ Obnovit), jen bez klienta, takže doběhne, i když všichni odejdou. **Jen na
  skutečný požadavek** – žádný časovač, plánované dotazy ani keep-alive (server po 15 min bez návštěvy klidně usne).
  Stejné hledání už běží nebo čeká → druhý přepočet ne, jen ho podrží do konce (fronta by ho jinak zahodila, kdyby
  jeho zakladatel zavřel stránku). Přepočet se zařadí, jen když hned začne nebo zůstane aspoň polovina fronty volná pro
  hledání lidí (refreshRoom) – jinak nic, starší výsledek stačí a zkusí to další požadavek. Nepovede se (výpadek zdroje,
  chyba) → starší platí dál do 30 min, další požadavek zkusí přepočet znovu.
- **↻ Obnovit / Zkusit znovu** u radaru, který už ceny ukazuje: aplikace pošle `newerThanS` = stáří cen na obrazovce –
  starší výsledek dostane, jen když je novější, jinak se hledá jako dřív (nebo se připojí k běžícímu přepočtu).
  `newerThanS` do klíče nepatří. Nový domov, první otevření a návrat po 30 min starší výsledek rády vezmou.
- **Přetížení (Retry-After, výš „Aplikace u přetíženého serveru“)**: starší výsledek odklad v aplikaci nezruší – server
  ho posílá i při plné frontě; kontrola hlídaných cen a radar dál samy nehledají do Retry-After.
- **`/api/health` → `searches`**: `staleHits` (kolikrát někdo dostal starší výsledek), `staleRefreshes` (rozběhnuté
  přepočty), `staleFailed` (přepočet nedal úplný výsledek), `staleSkipped` (přepočet se kvůli frontě nespustil);
  `ready` a `readyMb` počítají i starší výsledky.

Testy: test/swr.test.js (po TTL všem hned starší výsledek se stářím a jen jeden přepočet, pak nový; nepovedený přepočet
starší nezahodí; plná fronta = jen starší výsledek a nové hledání dál 503; `newerThanS`; přepočet podrží čekající
hledání, jehož zakladatel odešel; Lety bez staršího výsledku; klíč dotazu z SearchHelp.radarQuery; aplikace: stáří
z runSearch, odklad po přetížení, patička), test/crowd.test.js (starší výsledky do `staleMs`, strop paměti a pořadí
vyhazování).

Ručně (Playwright, DEMO, telefon 412 px, světlý režim): první návštěvník z Prahy čeká na radar 15 s (stroj vytížený
jinými úlohami); nový návštěvník (prázdný prohlížeč) po 2 min má karty za 4,6 s (načtení celé stránky – jako s hotovým
novým výsledkem, 5,7 s) se stejnými kartami a patičkou „Aktualizováno 12:18 (před 2 min)“, server spustí jeden
přepočet; další nový návštěvník po přepočtu dostane nový výsledek bez stáří; ↻ Obnovit pošle `newerThanS` a ukáže
nové ceny.

### Zátěž jako Render zdarma: noví návštěvníci po vypršení hotových výsledků

`CPU_QUOTA=0.1 SERVER_CPUS=0 ONLY=users USERS=10 AFTER_TTL=1 SEARCH_RESULT_TTL=10 node scripts/load-test.mjs` (DEMO,
hlavička skriptu): radary všech 10 návštěvníků (7 různých dotazů) se napřed jednou spočítají na plném jádře, po
vypršení hotových výsledků (tady 10 s místo 2 min) dostane server desetinu jádra a přijde 10 nových návštěvníků
naráz (stránka, soubory, API, radar…). „Před“ = `SEARCH_STALE_TTL=0` (bez staršího výsledku – stejné chování jako
dřív). „Karty“ = od příchodu návštěvníka (stránka, soubory aplikace, stav, našeptávač) po výsledek radaru.

| desetina jádra, 10 nových návštěvníků | před (2 běhy) | po (3 běhy) |
|---|---|---|
| **karty od příchodu** p50 / p95 | 134–145 / 288–295 s | **15–29 / 22–31 s** |
| odpověď radaru p50 / p95 | 128–137 / 264–270 s | 2,9–10 / 12–19 s |
| všichni návštěvníci hotovi za | 290–296 s | 29–36 s |
| stránka / soubory / API p95 | 13–20 / 2–17 / 2,5–4,8 s | 12–16 / 5–8 / 2,8–7,8 s |
| `/healthz` nejdéle | 11–19 s | 7–14 s |
| smyčka událostí nejdéle | 11–19 s | 7–8 s |
| procesor serveru | 29–30 s (během fáze) | 2,9–3,6 s během fáze + 27 s přepočty na pozadí |

Přepočty (7, jeden na dotaz, žádný nepropadl ani se nepřeskočil) doběhly 270 s po příchodu návštěvníků a vzaly
skoro stejně procesoru jako dřív hledání návštěvníků – práce je stejná, jen se na ni nečeká. Odpověď radaru
se starším výsledkem trvá na desetině jádra pořád sekundy: komprese ~0,6 MB a smyčka událostí sdílená
s přepočty (stejně jako stránka a API). Stroj sdílely jiné úlohy (zátěž 1–4,7 na 4 jádrech), čísla jsou orientační.

### Na co dát pozor
- Ceny na kartách můžou být až 30 min staré (dřív nejvýš 2 min) – vždy s poctivým stářím. Ceny zdrojů má server
  v mezipaměti 20–30 min tak jako tak; detail karty a „Všechny termíny“ hledají znovu, koupě je u prodejce.
- Procesor se tím neušetří: každý radar se po 2 min dál přepočítá (jen na pozadí, bez čekání). Stránka a API během
  přepočtů jsou pomalé jako dřív během čekání na radar.
- Výpadek zdroje: po nepovedeném přepočtu zkusí další požadavek nový (jako dřív každý návštěvník sám), pro jeden dotaz
  ale nejvýš jeden naráz.
- Po nasazení nebo probuzení serveru je paměť prázdná – první návštěvník z každého domova počítá jako dřív. Víc
  instancí (Další kroky bod 4) = každá vlastní starší výsledky.

## Menší odpověď radaru a konečné složení výsledku po kouscích (24. 10. 2026)

Navazuje na „Co zbývá“ z 23. 10. (níž): výsledek radaru byl velký a konečné složení výsledku běželo v kuse.

### Co radar z výsledku hledání čte
Radar na přehledu (flights.js radarSearch) hledá „kamkoliv“ a z výsledku vezme jen:
- **karty a jejich pořadí** – SearchHelp.radarPick s doporučeným pořadím (rank.js): z nabídek každého cíle (best
  a options) ta s nejnižší srovnávací cenou (letenka, cesta na letiště a do města, časy letů, přestupy, čas na místě,
  výhodnost proti statistice cen cíle), pořadí **všech** cílů s pestrostí zemí; výhodnost bere i medián „nejlevnější /
  obvyklá cena“ přes všechny cíle (Rank.ctxOf),
- **štítek ✓** „proč výš než levnější letenka“ – proti všem cílům (nejlevnější letenka bývá až za 20. kartou),
- **paměť cen** (PriceCheck.remember → ⭐ Moje cíle, „Je to dobrá cena?“, trend): statistika cen a letenky nabídek
  všech 150 cílů,
- **dopravu** na letiště a do města (origins, arrivals, Pins.extras → 📌 Porovnat), otisk 🏠 vlastních cen, výpadek
  zdroje, demo.

Všechno ostatní – Kdykoliv / Víkendy / Svátky, další karty (na telefonu pruh do strany), 🔎 detail karty, Od minula,
Tipy na tenhle měsíc, 📌 odložené karty radaru – už bere jen uložené karty (20 na režim v S.radar), ne výsledek
hledání. Hledání v Letech (výpis, karty, mapa, kalendář, filtry, porovnání) jde jiným dotazem a dostává výsledek celý
jako dřív.

### Co se změnilo
1. **Menší odpověď radaru**: aplikace posílá v dotazu radaru `radar: true` a server (search.js radarResult) vrátí
   stejných 150 cílů se stejnými nabídkami, jen s poli, která radar čte (let 13 polí místo ~25, nabídka 11 + úroveň
   ceny a výhodnost, cíl 6, statistika cen jen n / medián / minima po měsících), bez druhé kopie nejlevnější nabídky
   (best = options[0], doplní ji SearchHelp.radarRes) a s cestou do města jen k letištím nabídek. Odhad vlakem/busem
   u cílů (attachGround), který radar nečte, se pro něj ani nepočítá. Starší aplikace (bez `radar: true`) dostane
   výsledek celý; nová aplikace se starým serverem taky (radarRes ho nechá být). Hotový výsledek radaru se drží
   a sdílí zvlášť (jiný klíč dotazu), Lety ho nikdy nedostanou.
   **Méně cílů ani nabídek poslat nejde, aniž by se změnily karty**: pořadí počítá prohlížeč ze všech cílů podle cesty
   na letiště, časů a výhodnosti (to server nezná), 🙈 cíle (jen v prohlížeči) přeskakuje a bere další a paměť cen
   ukládá všech 150 cílů. Šlo by to jen s doporučeným pořadím na serveru (rank.js do serveru, 🙈 v dotazu – pak ale
   každý uživatel jiný dotaz a hotový výsledek by se nesdílel).
2. **Konečné složení výsledku a průběžné náhledy po kouscích**: compose a buildGroups (search.js) se po 256
   nabídkách, 32 cílech a mezi částmi (skupiny, odhad vlakem/busem, výpis) zeptají breathe() (crowd.js) – jako
   hledání tras od 23. 10. Náhled v Letech se skládá ze stavu, kdy začal (kopie nabídek, letů i stavu zdrojů), i když
   zdroje mezi kousky hledají dál; skončí-li hledání dřív, než se náhled doskládá, zahodí se a konečný výsledek se
   skládá až po něm (náhled po výsledku nepřijde, dvě skládání téhož hledání naráz neběží).
3. **Dokončení hledání má přednost** (`breathe(true)` v crowd.js: zbylé kombinace mixFinish a konečné složení): síť,
   časovače a ostatní požadavky se mezi kousky ke slovu dostanou dál, ale čekající kousky rozběhnutých hledání až po
   něm. Bez toho (první verze téhle úpravy) se při plném procesoru dokončení dělilo s ostatními hledáními a každé
   doběhlo až s nimi – jako Render zdarma radar p50 209 → 244 s; s předností 149 s (tabulka níž). Náhledy přednost
   nemají (jsou navíc).
4. **Výsledek sdíleného hledání se zapisuje každému zvlášť** (index.js streamSearch, `breathe(true)` před zápisem):
   dřív dostalo 100 lidí se stejným hledáním výsledek (řádek 1–2 MB do komprese) v jednom kuse. Našlo se to až při
   měření: se složením po kouscích (bod 2) se tenhle kus prodloužil (100 stejných hledání: smyčka nejdéle 0,6–1,2 s →
   1,5–2,0 s, příčinu jsem nenašel – úklid paměti to není); zápis po jednom ho odstranil úplně (tabulka níž).

Výsledky jsou stejné jako dřív: test/radar-slim.test.js (z plného i zmenšeného výsledku stejné karty, pořadí všech
cílů, srovnávací ceny všech nabídek, štítky ✓, paměť cen a doprava – Kdykoliv z Brna, Víkendy z Prahy, Svátky, i s 🙈;
pole, která DEMO nemá – odkaz obchodu, neznámý přílet, přestupy; přes /api/search: Lety dál celé),
test/scale.test.js (hledání po kouscích = v kuse i pro zmenšený radar; náhled po kouscích = v kuse, i když další
zdroj během jeho skládání hledá; náhled, jehož hledání mezitím skončilo, se zahodí; breathe(true) předběhne čekající
kousky, mezi sebou v pořadí). V test/engine.test.js se při porovnání výsledku s náhledy a bez nich už nesrovnává
statistika kombinací stats.mix peak / dropped (kolik letů se drželo a zahodilo naráz) – závisí na tom, jak se kousky
střídají; nabídky ne.

Ručně (DEMO, Praha +200 km, 2 os., telefon 412 px i počítač): radar Kdykoliv a Víkendy, všech 12 karet v pruhu,
🔎 detail karty, Tipy na tenhle měsíc, návrat na Kdykoliv z uloženého výsledku, Kamkoliv v Letech (přehled i mapa) –
texty i snímky stejné před a po (liší se jen štítek předpovědi počasí, když open-meteo přes proxy sandboxu neodpoví).

### Velikost odpovědi radaru (DEMO, 2 dospělí, z okolí 200 km)

| radar | JSON před | JSON po | brotli 4 (jako server) před → po | gzip před → po |
|---|---|---|---|---|
| Praha Kdykoliv | 1 527 kB | 601 kB | 131 → 62 kB | 149 → 63 kB |
| Brno Kdykoliv | 1 734 kB | 695 kB | 152 → 72 kB | 174 → 73 kB |
| Praha Víkendy | 1 548 kB | 610 kB | 132 → 63 kB | 151 → 63 kB |
| Brno Víkendy | 1 783 kB | 719 kB | 155 → 74 kB | 178 → 74 kB |

V prohlížeči (Praha, po síti): Kdykoliv 130,5 → 62,2 kB, Víkendy ~132–140 → 62,5 kB. Převod na JSON ~14–31 ms → 5–12 ms
(jednou na výsledek), brotli ~21–38 ms → 7–11 ms (pro každého, kdo výsledek dostane), hotový výsledek v paměti
(`_recentSearches`, řádek odpovědi) ~3,1–3,6 MB → 1,2–1,4 MB – do `SEARCH_RESULT_MB` 24 se vejde ~17 radarů místo ~7.

### Smyčka událostí při konečném složení (DEMO, 1 hledání po 2 rozehřívacích, nejdelší blok během compose)

| Kamkoliv z okolí 200 km, 3 běhy | před (celé složení v kuse) | po – Lety (bez `radar`) | po – radar |
|---|---|---|---|
| Brno | 75–117 ms | 19–25 ms | 20–30 ms |
| Praha | 72–109 ms | 33–51 ms | 26–29 ms |

Stroj byl sdílený (zátěž 5–9 na 4 jádrech) – časy jsou orientační a delší než na volném jádře. Zbylé delší kousky:
odhad vlakem/busem u cílů v Kamkoliv v Letech (attachGround v kuse, ~10–20 ms; radar ho nepočítá) a cesta do města
a výpis na konci (~5–10 ms). Render zdarma (0,1 CPU) je ~10× pomalejší: složení dřív ~1 s v kuse, teď kousky
~0,2–0,5 s.

### Zátěž (scripts/load-test.mjs, DEMO; stroj sdílely jiné úlohy – zátěž 3–10 na 4 jádrech, čísla orientační)

100 stejných hledání naráz (`ONLY=search-same NS=100 SERVER_CPUS=0` – jedno hledání v Letech sdílí 100 lidí):

| 1 jádro | před (6 běhů) | jen složení po kouscích (6 běhů) | po (2 běhy) |
|---|---|---|---|
| smyčka událostí nejdelší | 0,58–1,21 s | 1,45–1,97 s | 0,70 s |
| `/healthz` nejdelší | 0,55–1,29 s | 1,44–1,94 s | 0,59–0,74 s |
| procesor serveru | 5,4–6,1 s | 5,2–5,9 s | 5,3 s |
| paměť (RSS) nejvýš, jen tahle fáze | 0,67–0,68 GB (3 běhy) | 0,65–0,66 GB (3 běhy) | 0,38–0,40 GB |

50 návštěvníků naráz (`ONLY=users USERS=50 SERVER_CPUS=0`):

| 1 jádro, 50 návštěvníků | před (4 běhy) | po (2 běhy) | mezikroky (8 běhů) |
|---|---|---|---|
| procesor serveru | 49,0–53,1 s | 50,9 s | 46,1–50,0 s |
| vše doběhlo za | 51–55 s | 53–54 s | 48–52 s |
| radar p50 / p95 | 17,5–20,6 / 44,8–49,0 s | 15,5–24,7 / 38,5–43,6 s | 15,8–26,4 / 38,1–43,9 s |
| smyčka událostí p99 / nejdelší | 0,73–1,10 / 2,3–4,2 s | 0,71–1,07 / 2,6–3,0 s | 0,65–1,23 / 2,1–4,5 s |
| `/healthz` nejdelší | 2,4–9,4 s | 4,2–5,9 s | 2,3–10,6 s |
| stránka p95 | 4,6–10,2 s | 4,7–9,2 s | 1,4–10,4 s |
| API (stav, našeptávač, fotky, podnebí) p95 | 1,4–2,9 s | 1,3–1,7 s | 1,6–3,5 s |
| paměť (RSS) nejvýš | 1,09–1,37 GB | 1,39–1,51 GB | 1,07–1,48 GB |
| utržená spojení / chyby | 0 | 0 | 0 |

Mezikroky = bez přednosti dokončení a bez zápisu po jednom (4 běhy) a s předností, bez zápisu po jednom (4 běhy). Radar p95 o ~10–15 %
kratší; procesor a ostatní v rozptylu běhů. Fáze `users` je hlavně o stránce a souborech aplikace a 16 různých
radarech (hotový výsledek 2 min), menší odpověď a složení po kouscích v ní tvoří malou část práce. Paměť v DEMO
kolísá podle toho, kdy proběhne úklid (varianty jen s jednou z úprav: 1,13–1,41 GB) – rozdíl se tímto testem
neprokáže ani nevyloučí; DEMO hledání je navíc těžší než skutečné (viz „Paměť“ níž).

Jako Render zdarma (`CPU_QUOTA=0.1 SERVER_CPUS=0 ONLY=users USERS=10`, 2 běhy každé; bez zápisu po jednom – bod 4):

| desetina jádra, 10 návštěvníků | před | po kouscích bez přednosti | s předností dokončení |
|---|---|---|---|
| radar p50 / p95 | 207–211 / 261–264 s | 241–247 / 255–287 s | 141–157 / 258–299 s |
| procesor serveru | 29,6–30,5 s | 27,7–28,9 s | 28,7–32,5 s |
| vše doběhlo za | 297–306 s | 278–290 s | 288–326 s |
| smyčka událostí p99 / nejdelší | 4,5–5,6 / 12,8–16,9 s | 5,4–6,0 / 11,4–13,5 s | 4,2–4,7 / 13,4–16,5 s |
| `/healthz` nejdelší | 19,7–21,5 s | 11,3–11,8 s | 16,4–18,6 s |
| stránka / soubory / API p95 | 21–28 / 7–19 / 4–12 s | 1–3 / 6–27 / 8–16 s | 8–18 / 3–4 / 5–7 s |
| paměť (RSS) nejvýš | 0,79–0,87 GB | 0,79–1,01 GB | 0,85–1,10 GB |

Radar p50 o ~30 % kratší (dokončení hledání hned uvolní místo dalšímu), stránka a soubory aplikace rychleji; nejdelší
bloky (~12–17 s) dál dělá hlavně začátek hledání a DEMO data, ne složení výsledku.

### Co zbývá
- **V kuse zůstává**: u hledání ke konkrétnímu cíli kalendář a mřížka termínů (optimizer.js bestRoundTrips nad všemi
  lety trasy: Praha → Řím ~50–75 ms, Render ~0,5–0,75 s), u Kamkoliv v Letech odhad vlakem/busem (~10–20 ms) a na
  začátku hledání odpovědi zdrojů, které přijdou naráz (v DEMO kopie dat z mezipaměti).
- **Menší radar dál** jen s doporučeným pořadím na serveru (viz výš) – zatím nestavět.

## Soubory aplikace z Cloudflare (23. 10. 2026)

Skripty a styly dostával každý návštěvník od serveru: měly `no-cache` (každé použití se ověří u serveru, aby po
nasazení nikdy neběžel starý kód) – i 304 šlo až na server s desetinou jádra.

**Kde to pomáhá dnes a kde až později** (ověřeno na produkci 24. 10.): Cloudflare před Renderem je Renderův a na plánu
zdarma nic neukládá – všechny odpovědi mají `cf-cache-status: DYNAMIC`, i obrázky s `max-age` (docs Renderu: „Edge
caching is not available for free web services“). Dnes proto úspora jde z **mezipaměti prohlížeče**: vracející se
návštěvník a aktualizace po nasazení vezmou nezměněné soubory z telefonu bez ptaní (níž „bez service workeru“ a „po
nasazení“). Řádky „další nový návštěvník“ a „nový návštěvník po nasazení“ platí až s ukládáním na okraji: placený
web service na Renderu → Settings → Edge Caching → „Common static file types“ (Render při každém nasazení mezipaměť
sám vyprázdní), nebo vlastní doména přes vlastní účet Cloudflare. Kód se pro to už měnit nemusí.

### Co se změnilo
- **Otisk obsahu v adrese**: server ve stránce doplní ke každému skriptu a stylu otisk obsahu – `js/app.js?v=b481b0bbfa`
  (server/lib/pwa.js `versionAssets`, 10 znaků sha256). Týká se `<script src>`, `<link rel="stylesheet">`, odložených
  modulů (`data-later`) i knihoven map, které aplikace stahuje až na požádání (`data-files` u lazy.js → `Lazy.url`:
  d3, topojson, MapLibre). Stránka (`index.html`) zůstává `no-cache`, manifest, ikony a data (`*.json`) beze změny.
- **Odpověď s otiskem**: sedí-li `?v=` s obsahem souboru na disku, server pošle `Cache-Control: public,
  max-age=31536000, immutable` – Cloudflare i prohlížeč soubor drží rok bez ptaní. Změněný soubor má novou adresu,
  nezměněný starou (po nasazení se stáhne jen to, co se změnilo). Adresa bez otisku nebo s jiným (starší stránka
  v mezipaměti, starý service worker) dostane dnešní soubor jako dřív – s `no-cache`, takže jiný obsah, než otisk
  slibuje, nikde napořád neuvízne.
- **Service worker** (public/sw.js): seznam pro offline má adresy s otiskem (stejné jako stránka). Soubory s otiskem bere
  bez ověření u serveru (z mezipaměti prohlížeče, i při instalaci – stránka je právě stáhla) a pod adresu s otiskem
  uloží jen obsah, který server potvrdil (hlavička `X-Atlas-Hash` = otisk z adresy; vlastní hlavičku Cloudflare
  nepřepisuje, `Cache-Control` může); jinak se nic nemění: verze (`BUILD`) je dál otisk všech souborů,
  nová verze = nový sw.js → nová uložená sada, offline z ní, upozornění „Je k dispozici nová verze – Obnovit“.
- **CSP**: mění se jen adresy v začátcích značek `<script>`/`<link>`; vložené skripty zůstanou, otisky v CSP sedí
  (počítají se z hotové stránky).

### Kolik požadavků jde na server
Skutečný Chromium (Playwright, 412 px) přes simulovaný Cloudflare s výchozím nastavením (Cache Level Standard – adresa
i s `?v=`; drží jen js/css/obrázky/písma s `max-age`, ne HTML a JSON; hlavičky požadavku prohlížeče ignoruje), DEMO
server. Počet požadavků, které došly na server (bez API), a kolik kB poslal:

| situace | před | po |
|---|---|---|
| první návštěvník nové verze (prázdný Cloudflare) | 94 (826 kB) | 55 (829 kB) |
| další nový návštěvník | 89 (787 kB) | **11 (110 kB)** |
| vracející se, service worker, stejná verze | 3 | 3 |
| vracející se bez service workeru (jen mezipaměť prohlížeče) | 41 | **2** |
| vracející se po nasazení (změněný 1 skript), service worker | 89 (31 kB) | **12 (34 kB)** |
| totéž bez service workeru | 41 (19 kB) | **2 (16 kB)** |
| nový návštěvník po nasazení | 94 (826 kB) | **16 (150 kB)** |

Dřív byl každý skript a styl na serveru dvakrát (stránka + ověření při instalaci service workeru) – 39 souborů = 78
požadavků. Teď je jen první návštěvník nové verze stáhne ze serveru, ostatní je mají z Cloudflare. Na server dál jde
stránka (+ její ověření při instalaci service workeru), sw.js (registrace a kontrola verze), manifest a data
(`data/countries.json`, `entry.json`, `pretrip.json`, `vendor/countries-110m.json` – JSON Cloudflare bez pravidla
„Cache Rule“ nedrží; viz Další kroky) a API.
Zátěžový test `ONLY=users USERS=50 SERVER_CPUS=0` s modelem Cloudflare (`EDGE=1`): souborů aplikace na server 832 → 208
(624 z Cloudflare). Procesor se v tomto mixu skoro nezmění (~50 s) – ten bere radar; samotné soubory aplikace pro
200 nových návštěvníků naráz (jednorázový skript, 50 souborů na návštěvníka, 1 jádro): 10 000 → 3 070 požadavků,
procesor 2,1 s → 1,3 s (Render zdarma ~10×), vše doběhlo za 11 s → 4,6 s. Zbytek jsou JSON a ikony – a souběžní první
návštěvníci, než Cloudflare soubor má.

Ověřeno v prohlížeči (DEMO, 412 px, světlý režim): uživatel se starým service workerem (kód před úpravou) otevře novou
verzi → běží, nový service worker se nainstaluje se sadou s otisky a starou smaže; obnovení stránky = 3 požadavky na
server; offline obnovení ze service workeru včetně odložených modulů (Cesta, Objevuj, Plánovač, Sdílet); d3 a MapLibre
z adres s otiskem; další nasazení za běhu → „Je k dispozici nová verze – Obnovit“ → nový kód. Testy: test/pwa.test.js
(otisky ve stránce a v seznamu, hlavičky, jiný otisk a holá adresa, service worker), test/lazy.test.js (moduly
a `Lazy.url` s otiskem).

### Na co dát pozor (nasazení)
- **Až se zapne ukládání na okraji** (Render Edge Caching nebo vlastní Cloudflare): `?v=` musí být součást adresy
  v mezipaměti (u vlastního Cloudflare Caching Level „Standard“, výchozí, a žádné Cache Rule s „Ignore query string“).
  Kontrola (jen statické soubory, ne `/api/search`): `curl -sI '…/js/app.js?v=0000000000'` → `cache-control: no-cache`;
  adresa skriptu ze stránky podruhé → `cf-cache-status: HIT` a `cache-control: public, max-age=31536000, immutable`.
  Render navíc při každém nasazení mezipaměť okraje vyprázdní; u vlastního Cloudflare při chybě „Purge Everything“.
- **Starší verze u uživatelů**: stará stránka a starý service worker chtějí adresy bez otisku – server je dál posílá
  (`no-cache`). Ověřeno: první otevření po nasazení se starým service workerem funguje a nainstaluje nový.
- **Chvíle nasazení**, kdy odpovídá stará i nová instance (Render přepíná): soubor s cizím otiskem dostane obsah
  dané instance s `no-cache` – nikde se neuloží napořád a service worker ho pod adresu s otiskem neuloží. Stránka
  načtená přesně v tu chvíli může dostat směs verzí jako dřív; „Obnovit“ ji spraví.
- Na Renderu zdarma se na okraji nic neukládá, takže ani nic neuvízne; ručně se nic neudržuje.

## Návštěvníci aplikace naráz (23. 10. 2026)

Jak se měřilo – `ONLY=users USERS=50,200 SERVER_CPUS=0 node scripts/load-test.mjs` (hlavička skriptu):
- DEMO server (vymyšlené ceny, bez sítě) jen na **jednom jádře** (`taskset`), zátěž z jiného jádra. Render zdarma má
  desetinu jádra – tam trvá všechno ~10× déle (`CPU_QUOTA=0.1` = omezení přes cgroup, Linux a root; níž).
- Každý „návštěvník“ (vlastní adresa) projde, co dělá aplikace: stránka (třetina nových stáhne všech 44 souborů –
  od 23. 10. s otiskem v adrese jako prohlížeč; s `EDGE=1` je po prvním má Cloudflare –, ostatní jen ověří stránku
  a service worker – 304), `/api/health`, našeptávač (`/api/places`), radar na přehledu
  (Kdykoliv 70 %, Víkendy 30 %; domov Praha 45 %, Brno 15 %, Ostrava a Vídeň po 10 %, Pardubice, Katovice,
  Bratislava, Drážďany po 5 % – 16 různých dotazů), fotky karet (`/api/photos`), podnebí (`/api/climate`), ubytování
  a program v plánovači (`/api/stays`, `/api/nature`, `/api/itinerary`). Přijdou během 2 s, mezi kroky do 0,3 s.
- Zdroje cen s prodlevou 75–225 ms a s mezipamětí odpovědí jako skutečné (stejná trasa podruhé bez prodlevy).
- Smyčka událostí = `perf_hooks.monitorEventLoopDelay` v serveru: jak dlouho čeká každý další požadavek, než na něj
  přijde řada. Stroj sdílely i jiné úlohy – běhy se liší i o třetinu, čísla jsou orientační.

| 1 jádro | 50 před | 50 po | 200 před | 200 po |
|---|---|---|---|---|
| stránka (`/`) p95 | 47 s | 5,1 s | 145 s | 17 s |
| soubory aplikace p95 | 64 s | 1,4 s | 194 s | 13 s |
| API (stav, našeptávač, fotky, podnebí) p95 | 18 s | 2,7 s | 168 s | 8,7 s |
| plánovač (ubytování, program) p95 | 6,6 s | 1,2 s | 68 s | 1,0 s |
| radar p50 / p95 | 46 / 120 s | 26 / 49 s | 78 / 240 s | 23 / 59 s |
| `/healthz` nejdéle | 80 s | 7 s | 197 s | 14 s |
| smyčka událostí p99 / nejdéle | 7,5 / 10 s | 1,0 / 1,8 s | 7,3 / 11 s | 0,7 / 2,7 s |
| procesor serveru | 146 s | 50 s | 496 s | 71 s |
| paměť (RSS) nejvýš | 1,27 GB | 1,20 GB | 1,64 GB | 1,36 GB |
| utržená spojení | 0 | 0 | 7 | 0 |
| vše doběhlo za | 165 s | 52 s | 503 s | 73 s |

Dál (stejný skript): 100 stejných hledání naráz (`ONLY=search-same`) – smyčka nejdéle 3,6 s → 0,7 s, `/healthz`
3,5 s → 1,2 s, procesor 7,5 s → 5,7 s. 50 návštěvníků postupně během minuty (`RAMP_MS=60000` – blíž skutečnému
provozu, stejné hledání už neběží, ale je hotové): stránka p95 26 s → 1,3 s, soubory 24 s → 0,4 s, API 12 s → 0,7 s,
radar p50 43 s → 4,6 s, `/healthz` nejdéle 47 s → 2,5 s, procesor 150 s → 61 s.

Jako Render zdarma (`CPU_QUOTA=0.1 SERVER_CPUS=0`, 10 návštěvníků naráz): soubory aplikace p95 103 s → 0,08 s,
API p95 59 s → 5 s, `/healthz` nejdéle 99 s → 18 s, smyčka událostí nejdéle 70 s → 18 s, utržená spojení 7 → 0.
Radar ale trvá minuty i po úpravě (p50 240 s → 199 s) – desetina jádra na 41 s → 29 s práce prostě nestačí; zbylé
bloky jsou konečné složení výsledku, úklid paměti a v DEMO skládání vymyšlených cen při prvním dotazu na trasu.

### Co bylo úzké hrdlo a co se změnilo
1. **Jedno hledání zastavilo celý server** (hlavní příčina). Odpovědi zdrojů pro stovky tras chodí naráz a jejich
   skládání (lety trasy, kombinace aerolinek, prořezávání) běželo v jednom kuse – na jednom jádře až 10–20 s, kdy
   server nevyřídil nic jiného: stránka, `/healthz` i našeptávač čekaly minuty a server sám utrhl spojení, která
   nestihl za 30 s přečíst. Teď se hledání po každém kousku (lety jedné trasy, jeden cíl kombinací) zeptá
   `breathe()` (server/lib/crowd.js): běží-li tohle kolo smyčky přes 15 ms, počká na další kolo – mezitím se vyřídí
   ostatní požadavky. Čekající kousky jdou v pořadí, v jakém přišly (i z různých hledání), takže výsledek je stejný.
2. **Stejný radar se počítal pořád znovu**: sdílí se jen právě běžící hledání, návštěvníci ale chodí postupně – 200
   návštěvníků = ~100 výpočtů 16 různých radarů. Teď hotový **úplný** výsledek zůstane 2 min v paměti
   (server/index.js `_recentSearches`, `SEARCH_RESULT_TTL` v s, 0 = vypnuto; `SEARCH_RESULT_MB`, výchozí 24 – drží
   se hotový řádek odpovědi, radar ~3 MB) a další se stejným dotazem ho dostane hned (frontu ani strop adresy
   nezabere, do limitu hledání z adresy se počítá jako dřív). Úplný = všechny zdroje bez chyby a výpadku, bez
   vynechaných tras a tras z paměti (Wizz Air) a bez časového limitu – „Zkusit znovu“ a „Prohledat zbylé trasy“ tak
   dál opravdu hledají znovu. Ceny zdrojů jsou v mezipaměti 20–30 min, nové hledání během 2 min by dalo totéž; klíč je
   i s dnešním datem. Kolikrát to pomohlo: `/api/health` → `searches.readyHits` (a `ready`, `readyMb`, běžící `active`,
   čekající `queued`).
3. **Našeptávač** při každém písmenu převáděl tisíce názvů zemí, oblastí, měst a letišť (bez diakritiky, malá
   písmena) – ~17 ms procesoru na písmeno. Teď s pamětí převodů (server/lib/geo.js `normalize`): ~6 ms.
4. **Počítání s daty** (`addDays`, `daysBetween`, `weekday` při skládání cest – statisíce volání) bralo ~15 %
   procesoru hledání; teď s pamětí dnů (server/lib/dates.js).
5. **Výsledek sdíleného hledání se převáděl na JSON pro každého zvlášť** (radar ~1,5 MB textu, ~10 ms v kuse; 100
   stejných hledání = 1 s, kdy server nic jiného neobslouží) – teď jednou pro všechny (`ndjsonLine`).

Výsledky jsou stejné jako dřív – test/scale.test.js: hledání po kouscích (každý kousek v jiném kole) = totéž co
v kuse u kamkoliv, víkendů, jednosměrně i konkrétního cíle; během hledání se ke slovu dostane časovač (dřív celé
hledání v kuse); data a `normalize` s pamětí = původní převod i pro podivné vstupy; JSON výsledku jednou.
test/crowd.test.js: hotový výsledek bez dotazů na zdroje (tentýž řádek) i při plné frontě, neúplný výsledek se
nedrží, úklid paměti hotových výsledků.

### Co zbývá (po úpravě)
- **Procesor**: při 200 návštěvnících naráz je jedno jádro celé vytížené (71 s procesoru za 73 s) – stránka p95 ~17 s.
  Z toho ~20 % úklid paměti (GC: radar = desítky tisíc letů a 1,5 MB výsledku). Render zdarma (0,1 CPU) zvládne
  plynule jednotky lidí naráz; desítky a víc chtějí placený plán (viz Další kroky).
- ~~**Konečné složení výsledku** (`compose` v search.js) běží pořád v kuse: u radaru z Brna ~0,1 s (Render ~1 s),
  stejně průběžné náhledy v Letech~~ – od 24. 10. po kouscích (výš).
- **Paměť**: 4 hledání naráz v DEMO až ~1,2–1,4 GB RSS (DEMO hledání je těžší než skutečné a DEMO zdroje drží
  v mezipaměti ceny na každý den každé trasy) – tímto testem se 512 MB Renderu neověří. Hlídá ji strop
  `SEARCH_CONCURRENCY` 4 a pojistka mezipaměti (`CACHE_SOFT_MB`); kdyby Render hlásil nedostatek paměti, snížit
  `SEARCH_CONCURRENCY` na 2–3.
- **První komprese souborů aplikace** po nasazení nebo probuzení (brotli 9, 44 souborů): ~0,65 s procesoru v kuse po
  souborech (nejvíc 56 ms – flights.js), na Renderu zdarma ~6,5 s rozložených do prvních načtení.
- ~~**Výsledek radaru je velký**: radar ukáže 12 karet, server posílá 150 cílů (~1,5 MB JSON, ~130 kB brotli)~~ – od
  24. 10. ~0,6–0,7 MB a ~62–74 kB (stejných 150 cílů jen s poli, která radar čte – výš).

## Hledání naráz (22. 10. 2026)

### Co a jak se měřilo
- Server v DEMO režimu (vymyšlené ceny, bez sítě) na 4jádrovém stroji; zdroje cen s umělou prodlevou 75–225 ms
  na dotaz jako skutečné aerolinky. Zátěž z jednoho procesu Node (fetch + Promise.all), každý „uživatel“ s vlastní
  adresou. Produkce se nezatěžovala. Na stroji běžely i jiné úlohy – čísla jsou orientační.
- DEMO hledání „kamkoliv“ je těžší než skutečné (ceny na každý den každé trasy): ~2,5 s procesoru.

| zátěž (naráz) | před úpravou | po úpravě (4 hledání naráz + fronta 20) |
|---|---|---|
| 1000× `/api/health` | p50 1,3 s, p95 1,4 s | beze změny (tento kód se neměnil) |
| 1000× statické soubory | p50 2,2 s, p95 3,0 s | beze změny |
| 100 hledání (½ stejných, ½ různých) | **pád serveru**: paměť 2,2 GB → „heap out of memory“, 100 chyb, `/healthz` stál 105 s | 96 hotových, 4× 503 „zkus to za minutu“; paměť max 1,0 GB; vše do 104 s; `/healthz` nejvýš 11 s |
| 100 stejných hledání | **pád serveru** (2,2 GB), 100 chyb | 100 hotových, p50 9 s, p95 10 s; procesor 10 s místo ~100× víc |
| 60 různých z jedné adresy | 40 hotových (p50 110 s), 20× 429; paměť 1,6 GB; `/healthz` až 61 s | 8 hotových (do 13 s), 52× 429 hned (strop 8 rozběhnutých na adresu, do limitu adresy se nepočítá); paměť max 0,36 GB; `/healthz` max 3 s. Bez stropu na adresu (předchozí úprava): 24 hotových, 36× 503 – fronta plná i pro ostatní |

Pozn.: DEMO hledání zabere i ~70 MB (skutečné méně). Když hledání skončí, jeho výsledek se k uživateli dostane, až
procesor dopočítá ostatní (proto p50 ≈ konec) – jedno vlákno Node je úzké hrdlo, viz níž.
Zopakovat: `PROVIDER_CACHE=0 node scripts/load-test.mjs` (spustí si vlastní DEMO server, `ONLY=…`, `NS=…` viz hlavička
skriptu; tehdy zdroje bez mezipaměti – od 23. 10. ji skript zdrojům dává jako skutečným).

### Co je opravené (server/lib/crowd.js, ratelimit.js, cache.js)
- **Stejné hledání běží jednou pro všechny**: kdo pošle stejný dotaz, zatímco ještě běží, připojí se (dostane
  průběh i výsledek). Dotazy na aerolinky se sdílely už dřív (cache.wrap), teď i výpočet (1–3 s procesoru).
- **Strop souběžných hledání** (`SEARCH_CONCURRENCY`, výchozí 4) a fronta (`SEARCH_QUEUE`, 20). Nad frontou
  hned 503 „ATLAS teď hledá pro hodně lidí najednou – zkus to prosím za minutu“ (aplikace hlášku ukáže) místo pádu
  pro všechny. Hledání ve frontě, jehož klient mezitím odešel, se vůbec nespustí a místo ve frontě nedrží.
  Sdílí se jen běžící hledání: skončí-li chybou, dostanou ji ti, kdo na něj čekali, a další stejné hledání se spustí znovu.
- **Strop na adresu** (`SEARCH_PER_CLIENT`, výchozí 8): jedna adresa smí mít naráz nejvýš 8 rozběhnutých hledání
  (běží i čekají ve frontě), nad tím hned 429 s `Retry-After: 30` a „Z tvého připojení teď běží moc hledání naráz –
  počkej prosím, až některé doběhne…“ (do limitu adresy se nepočítá). Jedna adresa tak frontu (4 + 20) nezaplní.
  Místo se vrátí, jakmile hledání skončí (i chybou), nebo hned, když klient odejde (zrušené hledání, zavřená stránka),
  i když jeho hledání ještě běží. Připojení ke stejnému běžícímu hledání frontu nezabírá, takže projde i nad stropem
  (počítá se ale, ať jím nejde držet běhy, které jejich zakladatel opustil). Počty jsou jen pro právě otevřená
  hledání – po skončení se záznam adresy smaže, paměť s časem neroste.
- **Mezipaměť**: prošlé záznamy se jednou za minutu uklidí; nad 320 MB paměti procesu (`CACHE_SOFT_MB`) se
  zahodí starší polovina (odpověď Ryanairu „kamkoliv“ má stovky kB – strop 5 000 záznamů by se do 512 MB nevešel).
  Kolikrát se to stalo, ukazuje `/api/health` → `cache.trims`.
- **Limity z jedné adresy** s omezenou pamětí: dřív se při 5 000 adresách smazaly všem (limit na chvíli zmizel),
  teď jen neaktivní. Odpověď 429 nese `Retry-After` (za kolik sekund to půjde znovu).
- **Ochrana aerolinek**: po HTTP 429 se Ryanair na chvíli vynechá (Retry-After, jinak 2 min) – aplikace ukáže
  výpadek s odpočtem jako u Wizz Air; u Wizz Air po 429 nevyjdou ani dotazy, které už čekaly ve frontě.
- **Pomalý klient**: hlavičky do 20 s, celý požadavek do 30 s (odpověď – streamované hledání – se nezkracuje).
- Jeden uživatel nepozná rozdíl: limity z adresy mají stejné hodnoty a okna jako dřív (hledání 40 / 10 min, hlášení
  chyb z prohlížeče 30 / hodinu…), hledání bez návalu běží hned. Hlášky 429 i 503 aplikace ukáže česky (pole `error`).
  Strop 8 na adresu je nad tím, co aplikace v jednom okně pustí sama: radar 1 hledání (kontrola hlídaných cen jen
  když nic jiného neběží, po jedné), s hledáním v Letech a ruční kontrolou ceny běžně 1–3; nejvýš 7, když se radar
  rychle přepne přes Kdykoliv, Víkendy a 3 víkendy svátků (rozběhnuté hledání radaru se neruší, výsledek se uloží).
  Nové hledání v Letech předchozí zruší – místo se vrátí hned.
- Ověřeno testy `test/crowd.test.js` (limity, mezipaměť, sdílení, fronta, 503/429 s Retry-After, strop na adresu
  a jeho uvolnění po konci, chybě i odchodu klienta, pojistky aerolinek), `test/crowd-client.test.js` (výchozí nastavení:
  7 hledání naráz z jedné adresy projde, z 30 projde 8 a ostatní adresy dál hledají) a `test/clienterr.test.js`
  (hodinový limit hlášení chyb).
- Už dřív v pořádku: komprese statiky (brotli/gzip předpočítané v paměti, ETag, Cache-Control), timeout u každého
  dotazu ven, souběžnost na zdroj (Ryanair 6, Kiwi 3, Wizz 3 relace za sebou), pojistky Kiwi/Xotelo/Mapy.com,
  limit těla požadavku 64 kB, limity hledání / Objevuj / ověření z jedné adresy.

## Aplikace u přetíženého serveru (24. 10. 2026)

Aplikace sama nic neopakovala ve smyčce, ale přetížení násobila: vracející se uživatel s 12 hlídanými cenami po odmítnutí
radaru (503 „hledá pro hodně lidí“) poslal dalších 12 hledání po 4 s – všechna odmítnutá; „Zkontrolovat vše“ totéž;
každý návrat do aplikace nebo na Přehled hledal radar znovu. Teď (public/js/flights.js, alerts.js, pwa.js):
- **Retry-After platí**: po 503 / 429 / 502–504 (Pwa.httpError – bez hlavičky 30 s) se do té doby samo nehledá – radar
  po návratu ukáže starší ceny s hláškou a **↻ Zkusit znovu za 58 s** (odpočet, pak aktivní), kontrola hlídaných cen
  počká. Hledání, o které uživatel požádá (Najít, Obnovit radar), jde vždy; úspěšné hledání odklad zruší.
- **Kontrola hlídaných cen** skončí po prvním odmítnutí, chybě serveru, výpadku spojení nebo limitu (zbylá hlídání
  příště); „Zkontrolovat vše“ po prvním odmítnutí další nepošle.
- Hlášky česky i bez textu serveru (HTML z Renderu): Pwa.statusMsg místo „HTTP 503“ / „Unexpected token“ (ověření
  ceny, auta, přejezdy, cesta po zemi, Objevuj); našeptávač při přetížení „teď neodpovídá“, ne „Nic nenalezeno“.
- Fotky karet: stejný název se během rozběhnutého dotazu neptá znovu, po 429 se nové chvíli nežádají (Retry-After).
- Stav serveru po výpadku znovu za 15 s, 30 s … 5 min s odchylkou ±20 % (otevřené aplikace se nezeptají naráz).

Vracející se uživatel (domov Praha, radar starší 2 h, 12 hlídaných), DEMO, Playwright 412 px, 75 s od otevření
+ 3–5 návratů do aplikace (hledání = `POST /api/search`):

| odpověď serveru na hledání | hledání před | po |
|---|---|---|
| 503 „hledá pro hodně lidí“ (Retry-After 60), 5 návratů | 18 | **2** (radar, po minutě 1 hlídání) |
| 429 strop na adresu (Retry-After 30), 3 návraty | 16 | **3** |
| 502 HTML z Renderu na všechno, 3 návraty | 16 | **3** (fotky 5 → 1) |
| 500 (chyba v kódu) / spojení odmítnuto, 3 návraty | 16 | 5 (bez odkladu – radar při návratu znovu) |
| „Zkontrolovat vše“ (12) při 503 | 12 | **1** |

Bez chyby se start nemění: stav serveru, podnebí měsíce, náhled letišť, radar, zastaralá hlídání po jednom (4 s pauza,
až po radaru), fotky (3–5 dotazů podle rychlosti odpovědí). Testy: `test/overload-client.test.js`, `test/alerts.test.js`.

## Co zdarma vyřešit nejde
- **Render zdarma**: 512 MB paměti, 0,1 CPU, jedna instance, po 15 min bez návštěvy usne (první načtení ~1 min).
  Hledání, které tady stojí 1–3 s procesoru, tam trvá desítky sekund – reálně jednotky hledání naráz.
  Pro stovky lidí naráz je potřeba placený plán (aspoň 1 CPU / 2 GB), pak zvýšit `SEARCH_CONCURRENCY`, a víc instancí.
- **Smyčka událostí**: skládání výsledků hledání i konečné složení výsledku už se dělí na kousky (23. a 24. 10., výš) –
  v kuse zbývá kalendář a mřížka termínů u konkrétního cíle (~50–75 ms, Render ~0,5–0,75 s). Všechno ale pořád počítá
  jedno vlákno: víc hledání naráz zrychlí jen víc procesoru
  (worker_threads nebo víc instancí – Další kroky).
- **Víc instancí** = každá má vlastní mezipaměť, hotové výsledky, limity a sdílení hledání (Další kroky).
- **Neoficiální rozhraní**: Ryanair, Wizz Air (a Xotelo/TripAdvisor) nemají veřejné API; jejich podmínky
  automatické stahování zakazují. Při velkém provozu hrozí blokace adresy serveru (všechny dotazy jdou z jedné IP –
  blok postihne všechny uživatele) i právní spor. Pro 1000+ uživatelů je potřeba smluvní zdroj: affiliate API
  (Travelpayouts/Aviasales, Kiwi partner), případně placené GDS/NDC (Duffel, Amadeus).
- **Kapacita zdrojů**: Wizz Air ~3 dotazy naráz, Kiwi 3, Ryanair 6 – to je strop celé aplikace bez ohledu na
  server. Víc uživatelů = víc odpovědí z mezipaměti (paměť tras Wizz 6 h), ne víc dotazů.
- **Adresa klienta**: limity berou `CF-Connecting-IP` (před Renderem je Cloudflare – odpovědi mají `server: cloudflare`,
  hlavičku doplní a podvrženou přepíše), IPv6 po síti /64; první adresa z `X-Forwarded-For` (tu klient podvrhne) jen
  bez Cloudflare (server/lib/security.js clientIp). Po nasazení je v logu Renderu jednou řádek „Limity: adresa
  klienta z …“ – kdyby hlásil, že CF-Connecting-IP chybí, limit jde obejít a je potřeba to řešit.
- **Fronta je společná** – vyřešeno pro jednu adresu: strop 8 rozběhnutých hledání na adresu (viz výš), takže jedna
  adresa frontu nezaplní. Zbývá: tři a víc adres naráz (útok z více adres) ji zaplnit pořád můžou – to bez sdílených
  limitů a ověření klienta zdarma nevyřešíme. A naopak víc lidí za jednou adresou (domácí síť, sdílená adresa
  mobilního operátora) má strop i limit 40 / 10 min společný – při dnešním provozu nepravděpodobné, kdyžtak zvýšit
  `SEARCH_PER_CLIENT`. Hledání, které klient opustil, už se nepočítá; pokud už běželo, doběhne (nejvýš
  `SEARCH_CONCURRENCY` naráz, do limitu 40 / 10 min) – čekající se nespustí.
- **Pojistka paměti měří RSS** (to hlídá Render). Node paměť po úklidu systému vrací pomalu, takže po špičce může
  mezipaměť ještě pár minut zahazovat polovinu každých 30 s – jen pomalejší hledání, ne chyba.
- Rozběhnuté dotazy na aerolinky po odchodu klienta doběhnou (sdílí je ostatní a výsledek zůstane v mezipaměti);
  zastaví se jen hledání, které ještě čekalo ve frontě.

## Další kroky při růstu (zatím nestavět – až to bude potřeba)
1. **Teď (Render zdarma, 1 instance)**: sledovat `/api/health` → `searches` (`readyHits` = ušetřená hledání, `staleHits`
   = radar hned ze staršího výsledku, `staleFailed` = nepovedené přepočty, `queued` = fronta) a `cache.trims`; v logu
   Renderu 503 „hledá pro hodně lidí“. Nic placeného, žádná údržba navíc.
2. **Desítky lidí naráz → placený plán s 1 CPU / 2 GB** (Render Standard): `SEARCH_CONCURRENCY` 6–8, `SEARCH_QUEUE`
   40, `CACHE_SOFT_MB` ~1200, `SEARCH_RESULT_MB` 64; `SEARCH_RESULT_TTL` klidně 300 (ceny zdrojů platí 20–30 min).
   Bez dalších úprav kódu – jen proměnné prostředí. Výpočet hledání mimo hlavní vlákno (`worker_threads`, 1 vlákno
   na jádro) až s 2+ CPU – na jednom jádře nic nezrychlí.
3. **Soubory aplikace z okraje sítě** – skripty a styly mají otisk v adrese (23. 10., výš); na Renderu zdarma pomáhá
   jen mezipaměť prohlížeče. S placeným plánem zapnout Settings → Edge Caching („Common static file types“; data
   `/data/*.json` a `/vendor/*.json`, ~320 kB na nového návštěvníka, a neměnné odpovědi API jako `/api/climate`
   s `max-age` by chtěly „All file types“ – pak ověřit, že dynamické odpovědi mají `no-store`/`private`).
4. **Stovky lidí naráz → víc instancí**: každá má vlastní mezipaměť cen, hotové výsledky, limity a frontu. Pak
   sdílená mezipaměť a hotové výsledky + limity z adresy ve sdíleném úložišti (Redis/Valkey, např. Render Key Value)
   a směrování stejného dotazu na stejnou instanci (sticky podle klíče hledání), jinak se běžící hledání nesdílí.
5. **Oblíbené dotazy předem**: ~~radar z hlavních domovů (Praha, Brno, Ostrava, Vídeň, Katovice) je pořád tentýž –
   při stálém provozu (server nespí) vrátit hotový výsledek i chvíli po vypršení a přepočítat ho na pozadí
   („stale-while-revalidate“, bez plánovaných dotazů a keep-alive)~~ – od 24. 10. (nahoře: starší výsledek radaru do
   30 min, přepočet jen na požadavek). Odpověď radaru jen s 12–20 kartami místo 150 cílů chce doporučené pořadí
   (rank.js) na serveru – 24. 10. zmenšena jen o pole, která radar nečte (výš).
6. **Tisíce uživatelů → smluvní zdroje dat**: neoficiální rozhraní Ryanairu a Wizz Air z jedné adresy serveru tolik
   dotazů neunesou (blokace postihne všechny). Affiliate API (Travelpayouts/Aviasales – už zapojené, Kiwi Tequila
   partner), později GDS/NDC (Duffel, Amadeus – placené). Mezipaměť cen pak sdílená mezi instancemi (bod 4).
