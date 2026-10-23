# Škálování ATLAS – co snese jeden server zdarma a co ne

Podklad k podnikatelskému plánu (cíl: 1000+ lidí naráz, později desítky tisíc uživatelů). Stav k 23. 10. 2026.

## Návštěvníci aplikace naráz (23. 10. 2026)

Jak se měřilo – `ONLY=users USERS=50,200 SERVER_CPUS=0 node scripts/load-test.mjs` (hlavička skriptu):
- DEMO server (vymyšlené ceny, bez sítě) jen na **jednom jádře** (`taskset`), zátěž z jiného jádra. Render zdarma má
  desetinu jádra – tam trvá všechno ~10× déle (`CPU_QUOTA=0.1` = omezení přes cgroup, Linux a root; níž).
- Každý „návštěvník“ (vlastní adresa) projde, co dělá aplikace: stránka (třetina nových stáhne všech 44 souborů,
  ostatní jen ověří stránku a service worker – 304), `/api/health`, našeptávač (`/api/places`), radar na přehledu
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
- **Konečné složení výsledku** (skupiny, ceny, štítky – `compose` v search.js) běží pořád v kuse: u radaru z Brna
  ~0,1 s na tomto stroji (Render ~1 s). Stejně průběžné náhledy hledání v Letech. Rozdělit = přepsat `buildGroups`
  na kousky.
- **Paměť**: 4 hledání naráz v DEMO až ~1,2–1,4 GB RSS (DEMO hledání je těžší než skutečné a DEMO zdroje drží
  v mezipaměti ceny na každý den každé trasy) – tímto testem se 512 MB Renderu neověří. Hlídá ji strop
  `SEARCH_CONCURRENCY` 4 a pojistka mezipaměti (`CACHE_SOFT_MB`); kdyby Render hlásil nedostatek paměti, snížit
  `SEARCH_CONCURRENCY` na 2–3.
- **První komprese souborů aplikace** po nasazení nebo probuzení (brotli 9, 44 souborů): ~0,65 s procesoru v kuse po
  souborech (nejvíc 56 ms – flights.js), na Renderu zdarma ~6,5 s rozložených do prvních načtení.
- **Výsledek radaru je velký**: radar ukáže 12 karet, server posílá 150 cílů (~1,5 MB JSON, ~130 kB brotli) –
  zmenšit = změna aplikace i serveru.

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

## Co zdarma vyřešit nejde
- **Render zdarma**: 512 MB paměti, 0,1 CPU, jedna instance, po 15 min bez návštěvy usne (první načtení ~1 min).
  Hledání, které tady stojí 1–3 s procesoru, tam trvá desítky sekund – reálně jednotky hledání naráz.
  Pro stovky lidí naráz je potřeba placený plán (aspoň 1 CPU / 2 GB), pak zvýšit `SEARCH_CONCURRENCY`, a víc instancí.
- **Smyčka událostí**: skládání výsledků hledání už se dělí na kousky (23. 10., výš) – v kuse zbývá konečné složení
  výsledku (~0,1 s, Render ~1 s). Všechno ale pořád počítá jedno vlákno: víc hledání naráz zrychlí jen víc procesoru
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
1. **Teď (Render zdarma, 1 instance)**: sledovat `/api/health` → `searches` (`readyHits` = ušetřená hledání, `queued`
   = fronta) a `cache.trims`; v logu Renderu 503 „hledá pro hodně lidí“. Nic placeného, žádná údržba navíc.
2. **Desítky lidí naráz → placený plán s 1 CPU / 2 GB** (Render Standard): `SEARCH_CONCURRENCY` 6–8, `SEARCH_QUEUE`
   40, `CACHE_SOFT_MB` ~1200, `SEARCH_RESULT_MB` 64; `SEARCH_RESULT_TTL` klidně 300 (ceny zdrojů platí 20–30 min).
   Bez dalších úprav kódu – jen proměnné prostředí. Výpočet hledání mimo hlavní vlákno (`worker_threads`, 1 vlákno
   na jádro) až s 2+ CPU – na jednom jádře nic nezrychlí.
3. **Soubory aplikace přes Cloudflare**: dnes mají `no-cache` (každé použití se ověří u serveru – nová verze se tak
   nikdy nemíchá se starou), takže každý nový návštěvník = ~44 požadavků na server. Verze v adrese souboru
   (`js/app.js?v=<otisk>` doplněný serverem do index.html a service workeru) + `Cache-Control: public, max-age=31536000,
   immutable` → Cloudflare a prohlížeč drží celou aplikaci, na server jde jen stránka a API. Totéž pro neměnné odpovědi
   API (`/api/climate`, `/api/nature` mají `max-age` – Cloudflare je ale bez pravidla „Cache Rule“ nedrží).
4. **Stovky lidí naráz → víc instancí**: každá má vlastní mezipaměť cen, hotové výsledky, limity a frontu. Pak
   sdílená mezipaměť a hotové výsledky + limity z adresy ve sdíleném úložišti (Redis/Valkey, např. Render Key Value)
   a směrování stejného dotazu na stejnou instanci (sticky podle klíče hledání), jinak se běžící hledání nesdílí.
5. **Oblíbené dotazy předem**: radar z hlavních domovů (Praha, Brno, Ostrava, Vídeň, Katovice) je pořád tentýž –
   při stálém provozu (server nespí) vrátit hotový výsledek i chvíli po vypršení a přepočítat ho na pozadí
   („stale-while-revalidate“, bez plánovaných dotazů a keep-alive). Případně menší odpověď pro radar (12–20 karet místo
   150 cílů).
6. **Tisíce uživatelů → smluvní zdroje dat**: neoficiální rozhraní Ryanairu a Wizz Air z jedné adresy serveru tolik
   dotazů neunesou (blokace postihne všechny). Affiliate API (Travelpayouts/Aviasales – už zapojené, Kiwi Tequila
   partner), později GDS/NDC (Duffel, Amadeus – placené). Mezipaměť cen pak sdílená mezi instancemi (bod 4).
