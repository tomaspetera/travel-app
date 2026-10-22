# Škálování ATLAS – co snese jeden server zdarma a co ne

Podklad k podnikatelskému plánu (cíl: 1000+ lidí naráz). Stav k 22. 10. 2026.

## Co a jak se měřilo
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
| 60 různých z jedné adresy | 40 hotových (p50 110 s), 20× 429; paměť 1,6 GB; `/healthz` až 61 s | 24 hotových (do 46 s), 36× 503 (fronta plná, do limitu adresy se nepočítá); `/healthz` max 5 s |

Pozn.: DEMO hledání zabere i ~70 MB (skutečné méně). Když hledání skončí, jeho výsledek se k uživateli dostane, až
procesor dopočítá ostatní (proto p50 ≈ konec) – jedno vlákno Node je úzké hrdlo, viz níž.
Zopakovat: `node scripts/load-test.mjs` (spustí si vlastní DEMO server, `ONLY=…`, `NS=…` viz hlavička skriptu).

## Co je opravené (server/lib/crowd.js, ratelimit.js, cache.js)
- **Stejné hledání běží jednou pro všechny**: kdo pošle stejný dotaz, zatímco ještě běží, připojí se (dostane
  průběh i výsledek). Dotazy na aerolinky se sdílely už dřív (cache.wrap), teď i výpočet (1–3 s procesoru).
- **Strop souběžných hledání** (`SEARCH_CONCURRENCY`, výchozí 4) a fronta (`SEARCH_QUEUE`, 20). Nad frontou
  hned 503 „ATLAS teď hledá pro hodně lidí najednou – zkus to prosím za minutu“ (aplikace hlášku ukáže) místo pádu
  pro všechny. Hledání ve frontě, jehož klient mezitím odešel, se vůbec nespustí.
- **Mezipaměť**: prošlé záznamy se jednou za minutu uklidí; nad 320 MB paměti procesu (`CACHE_SOFT_MB`) se
  zahodí starší polovina (odpověď Ryanairu „kamkoliv“ má stovky kB – strop 5 000 záznamů by se do 512 MB nevešel).
  Kolikrát se to stalo, ukazuje `/api/health` → `cache.trims`.
- **Limity z jedné adresy** s omezenou pamětí: dřív se při 5 000 adresách smazaly všem (limit na chvíli zmizel),
  teď jen neaktivní. Odpověď 429 nese `Retry-After` (za kolik sekund to půjde znovu).
- **Ochrana aerolinek**: po HTTP 429 se Ryanair na chvíli vynechá (Retry-After, jinak 2 min) – aplikace ukáže
  výpadek s odpočtem jako u Wizz Air; u Wizz Air po 429 nevyjdou ani dotazy, které už čekaly ve frontě.
- **Pomalý klient**: hlavičky do 20 s, celý požadavek do 30 s (odpověď – streamované hledání – se nezkracuje).
- Už dřív v pořádku: komprese statiky (brotli/gzip předpočítané v paměti, ETag, Cache-Control), timeout u každého
  dotazu ven, souběžnost na zdroj (Ryanair 6, Kiwi 3, Wizz 3 relace za sebou), pojistky Kiwi/Xotelo/Mapy.com,
  limit těla požadavku 64 kB, limity hledání / Objevuj / ověření z jedné adresy.

## Co zdarma vyřešit nejde
- **Render zdarma**: 512 MB paměti, 0,1 CPU, jedna instance, po 15 min bez návštěvy usne (první načtení ~1 min).
  Hledání, které tady stojí 1–3 s procesoru, tam trvá desítky sekund – reálně jednotky hledání naráz.
  Pro stovky lidí naráz je potřeba placený plán (aspoň 1 CPU / 2 GB), pak zvýšit `SEARCH_CONCURRENCY`, a víc instancí.
- **Smyčka událostí**: skládání výsledků hledání (kombinace letů) běží v kuse i ~1–2 s; mezitím čekají všechny
  ostatní požadavky (i `/healthz`). Řešení: rozdělit výpočet / worker_threads – větší přestavba, jen s víc CPU.
- **Víc instancí** = každá má vlastní mezipaměť, limity a sdílení hledání. Pak sdílená mezipaměť a limity
  (Redis/Valkey, např. Render Key Value – zdarma jen malá) a „sticky“ směrování stejných hledání.
- **Neoficiální rozhraní**: Ryanair, Wizz Air (a Xotelo/TripAdvisor) nemají veřejné API; jejich podmínky
  automatické stahování zakazují. Při velkém provozu hrozí blokace adresy serveru (všechny dotazy jdou z jedné IP –
  blok postihne všechny uživatele) i právní spor. Pro 1000+ uživatelů je potřeba smluvní zdroj: affiliate API
  (Travelpayouts/Aviasales, Kiwi partner), případně placené GDS/NDC (Duffel, Amadeus).
- **Kapacita zdrojů**: Wizz Air ~3 dotazy naráz, Kiwi 3, Ryanair 6 – to je strop celé aplikace bez ohledu na
  server. Víc uživatelů = víc odpovědí z mezipaměti (paměť tras Wizz 6 h), ne víc dotazů.
- **Adresa klienta**: limity berou první adresu z `X-Forwarded-For`. Ověřit na Renderu, že ji klient nemůže
  podvrhnout (jinak brát adresu, kterou doplní Render/Cloudflare) – jinak limit obejde kdokoli.
- Rozběhnuté dotazy na aerolinky po odchodu klienta doběhnou (sdílí je ostatní a výsledek zůstane v mezipaměti);
  zastaví se jen hledání, které ještě čekalo ve frontě.
