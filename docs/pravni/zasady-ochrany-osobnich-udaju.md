# Zásady ochrany osobních údajů – Letsi (návrh pro advokáta)

> **Návrh, ne platný text.** Sepsáno podle skutečného chování kódu ke dni 16. 11. 2026 (podmínka spuštění č. 3
> z plánu 1.2). Každé tvrzení o zpracování má v poznámce pod oddílem odkaz do kódu, kde se dá ověřit. Údaje
> v hranatých závorkách doplní provozovatel – repozitář je veřejný, proto v něm skutečné osobní údaje nejsou.
> Poznámky „Kde v kódu“ a oddíl Otázky pro advokáta do zveřejněné verze nepatří.

## 1. Kdo údaje zpracovává

Správcem osobních údajů je provozovatel aplikace Letsi (web https://letsi.cz a aplikace na plochu
z něj nainstalovaná):

- [jméno a příjmení]
- IČO: [IČO]
- adresa: [adresa]
- e-mail: [e-mail]

Pověřence pro ochranu osobních údajů nemáme jmenovaného (není povinný). [ověřit – viz Otázky]

## 2. Krátce

- Letsi nemá účty, registraci ani přihlášení. **Nepoužívá cookies a nesleduje jednotlivce** – kromě záznamu návštěvy
  podle bodu 3.7, pokud ho sám zapneš. Počítá jen souhrnné denní počty – kolikrát se otevřela aplikace, kolik
  proběhlo hledání, kolik cest vzniklo (bod 3.6).
- Tvoje cesty, hlídané ceny, oblíbená místa a nastavení jsou **jen v tvém prohlížeči** na tvém zařízení. Na server se
  neposílají.
- Server Letsi dostane jen to, co potřebuje k odpovědi (např. odkud a kam hledáš let), a tvou IP adresu, kterou
  krátce drží v paměti kvůli ochraně proti přetížení.
- Na serveru se trvale ukládá jen cesta, kterou **sám sdílíš krátkým odkazem** – na 400 dní – a souhrnné denní počty
  bez osobních údajů.
- Letenky ani ubytování neprodáváme. Když klepneš na odkaz k rezervaci, přejdeš na web prodejce a platí jeho zásady.

## 3. Co přijímá server Letsi a jak dlouho to drží

### 3.1 IP adresa – ochrana proti přetížení

Server u většiny dotazů (hledání letů, ubytování, fotky, počasí, mapy, sdílení, hlášení chyb, souhrnné počítání) počítá, kolik požadavků
přišlo z jedné adresy, a nad limitem další na chvíli odmítne. K tomu si pamatuje IP adresu (u IPv6 jen síť /64,
tedy prvních 64 bitů) a časy posledních požadavků z ní.

- **Kde:** jen v operační paměti serveru, nikam se nezapisuje (žádný soubor ani databáze).
- **Jak dlouho:** započítávají se požadavky za posledních 10 minut (u hlášení chyb, u vytváření krátkých odkazů a u
  špatného klíče ke statistikám za posledních 60 minut). U souhrnného počítání (bod 3.6) se navíc počítá, kolikrát
  přišla z jedné adresy stejná událost (nejvýš 30 za 10 minut); adresa se k tomu drží jen v paměti limitu spolu
  s názvem události, k počtům se neukládá. Starší časy se už nepoužívají; záznam adresy server z paměti sám smaže
  nejpozději po uplynutí okna od posledního započteného požadavku z ní (tedy do 10, resp. 60 minut; úklid běží každých
  30 sekund), dřív při úklidu po překročení 5 000 adres nebo při restartu serveru. [ověřit – viz Otázky, bod 1]
- **Účel a právní základ:** ochrana služby a zdrojů dat před zahlcením a zneužitím – oprávněný zájem (čl. 6 odst. 1
  písm. f) GDPR).

> Kde v kódu: `server/lib/ratelimit.js` (třída `RateLimiter`, okno 10 min, strop 5 000 adres, `prune`, `sweep` každých
> `sweepMs` = 30 s – smaže adresy, jejichž poslední požadavek vypadne z okna),
> `server/index.js` funkce `rateLimited()` a seznam limitů (`clientErrs`, `shareHits` a `statsFails` s oknem 60 min,
> `countPairs` s klíčem adresa|událost),
> `server/lib/security.js` funkce `clientIp()` a `ipKey()` (IPv6 → /64, adresa z hlavičky `CF-Connecting-IP`),
> `render.yaml` (`plan: free`, usínání po 15 min). Zápis na disk server nemá (`writeFile`/`appendFile` se v `server/`
> nepoužívá).

### 3.2 Obsah dotazů

Aby Letsi mohlo odpovědět, posílá prohlížeč serveru údaje o hledání: odkud a kam, termín, počet cestujících (dospělí,
děti, miminka), zavazadla, způsob cesty na letiště a výchozí místo (domov), u ubytování místo, termín a počet hostů,
v Objevuj místo a volby programu. **Polohu zařízení** prohlížeč zjistí a použije jen tehdy, když sám klepneš na
📍 Moje poloha nebo Moje okolí (prohlížeč se tě nejdřív zeptá na povolení). Ven ji pošle jen zaokrouhlenou:
domov z 📍 Moje poloha na 2 desetinná místa (asi 1 km – tak se i uloží a posílá při dalších otevřeních), Objevuj → Tady
na 3 desetinná místa (asi 100 m).

Server odpovědi drží chvíli v mezipaměti v operační paměti (podle dotazu, ne podle uživatele – IP adresa ani jiný
identifikátor v ní není), aby stejný dotaz nemusel znovu ke zdrojům dat.

- **Právní základ:** poskytnutí služby, o kterou žádáš (čl. 6 odst. 1 písm. b) GDPR).

> Kde v kódu: `public/js/about.js` (oddíl „Co se na server posílá“, hlídá ho `test/about.test.js`),
> `server/lib/cache.js` (mezipaměť v paměti), poloha jen na klepnutí `public/js/flights.js` a `public/js/places.js`
> (`navigator.geolocation.getCurrentPosition`; zaokrouhlení `SearchHelp.myPlace` v `public/js/searchhelp.js`, `exGeo`
> v `public/js/places.js`, pojistka `poiCoord` v `server/index.js`).

### 3.3 Hlášení chyb z prohlížeče

Když v aplikaci nastane chyba v kódu, prohlížeč ji automaticky nahlásí serveru, abychom ji mohli opravit. Hlášení
obsahuje jen:

- text chyby (e-maily a dlouhá čísla – telefon, kód rezervace, číslo karty – nahradí `[e-mail]` a `[číslo]`),
- soubor a řádek v kódu aplikace (adresy bez části za `?` a `#`, kde bývá hledání nebo sdílená cesta),
- verzi aplikace a zkrácený název prohlížeče a systému (např. „Chrome 130 · Android 14“).

IP adresa ani nic z tvých cest součástí hlášení není (IP adresa se jen započítá do limitu podle bodu 3.1). Prohlížeč
pošle nejvýš 1 hlášení za 10 sekund a 20 za návštěvu; chyby z rozšíření prohlížeče se neposílají.

- **Kde a jak dlouho:** server hlášení znovu očistí a zapíše jako jeden řádek do provozního logu hostingu (nejvýš
  120 řádků za hodinu) – v logu zůstane po dobu uchovávání logů hostingu [doplnit podle Renderu]. V paměti serveru je
  posledních 50 hlášení, při restartu se smažou. Veřejně (`/api/health`) je jen jejich počet, ne obsah.
- **Právní základ:** oprávněný zájem na funkční a bezpečné aplikaci (čl. 6 odst. 1 písm. f) GDPR).

> Kde v kódu: `public/js/errlog.js` (`scrub`, `cleanUrl`, `shortUa`, `limiter`: 10 s, 20 za relaci, 2 KB),
> `server/lib/clienterr.js` (`cleanReport`, `stripUrl`, `KEEP = 50`, `LOG_PER_HOUR = 120`, `recordClientError` →
> `console.warn`), `server/index.js` obsluha `/api/client-error` (limit 30 za hodinu z adresy) a `/api/health`
> (`clientErrors: clientErrorCount()`). Funkce `recentClientErrors()` se nikde nevolá – 50 hlášení ven nejde.

### 3.4 Krátké odkazy na sdílenou cestu (`/c/…`)

Když klepneš na **Poslat kamarádům** nebo **Sdílet plán**, aplikace nejdřív zkusí vytvořit krátký odkaz
(např. `…/c/Ab3kQ9xZ`). Server k tomu uloží:

- obsah cesty nebo plánu, jak ho nese dlouhý odkaz – cíl, termín, let, ubytování, cestující (počty), program po dnech,
  seznam „Co zařídit a co sbalit“ (zkomprimovaný),
- náhled odkazu: název (cíl a termín), krátký popis a adresu fotky cíle,
- čas vytvoření.

Neukládá se tvoje IP adresa, jméno ani nic, co by odkaz spojilo s tebou. Z cesty se před sdílením vynechá odškrtnutí
rezervací, čas založení, 🔖 kódy rezervací a kód jízdenky. Sdílí se ale vlastní název cesty a poznámky, které napíšeš.
[ověřit – viz Otázky, bod 3]

- **Kde:** databáze Upstash Redis (Upstash, Inc.), region [doplnit region]; kopii nejvýš 300 nedávno otevřených
  odkazů drží server Letsi v paměti do restartu. Prohlížeč a síť doručení obsahu mohou otevřenou cestu
  (`/api/share/<id>`) držet v mezipaměti 1 den.
- **Jak dlouho:** 400 dní od vytvoření, pak ji Upstash sám smaže. [smazání dřív na žádost – viz Otázky, bod 4]
- **Kdo k ní má přístup:** kdokoli, kdo má odkaz (8 náhodných znaků; zkoušení náhodných odkazů brzdí limit).
- **Právní základ:** poskytnutí služby, o kterou žádáš (čl. 6 odst. 1 písm. b) GDPR).

Bez krátkého odkazu (když úložiště není zapnuté nebo nedostupné) a u odkazu **📲 Přenést do jiného zařízení** nese
data jen část adresy za `#`, kterou prohlížeč na server neposílá – nic se neukládá. Stejně u pozvánky
„Jede někdo se mnou?“ (`/j/…`): cíl, měsíc a místo odletu jsou přímo v adrese, server z nich jen vytvoří náhled
a nic neukládá.

> Kde v kódu: `server/lib/shortlinks.js` (`createShare` – záznam `{ k, z, m: { title, desc, img }, t }`, `TTL_DAYS = 400`,
> `newId`, `upstashStore` s `SET … EX … NX`, `cachedStore` max 300, `inviteMeta` bez úložiště), `server/index.js`
> obsluha `/api/share`, `/api/share/<id>` (`Cache-Control: public, max-age=86400`) a `shareStore` (Upstash jen
> s `UPSTASH_REDIS_REST_URL` a `_TOKEN`), `public/js/trip.js` `shareJson()` a `linkJson()` (co se z cesty vynechá).

### 3.5 Logy hostingu

Server běží u **Render** (Render Services, Inc., USA; server v regionu Frankfurt, EU). Před serverem je síť
**Cloudflare**, kterou používá Render. Jako u každého webu vidí a zaznamenávají tyto služby technické údaje
o požadavcích – IP adresu, čas, adresu stránky (včetně části za `?`, např. hledaný text v našeptávači, ne však části
za `#`) a identifikaci prohlížeče. Do logu hostingu zapisuje i server Letsi: provozní hlášky a hlášení chyb podle
bodu 3.3, **IP adresy ani obsah hledání sám nezapisuje**.

- **Jak dlouho:** [doplnit dobu uchovávání logů podle tarifu Renderu].
- **Právní základ:** oprávněný zájem na provozu a zabezpečení služby (čl. 6 odst. 1 písm. f) GDPR).

> Kde v kódu: `render.yaml` (`region: frankfurt`), `server/lib/security.js` (komentář u `clientIp()`: na Renderu
> Cloudflare a hlavička `CF-Connecting-IP`), výpisy `console.*` v `server/index.js` – žádný neobsahuje IP adresu.

### 3.6 Souhrnné denní počty

Abychom věděli, které části aplikace lidé používají a kde narážejí, počítá se, **kolikrát za den** se něco stalo:
otevření aplikace, otevření sekce (Přehled, Lety, Cesty, Objevuj, Svět), proběhlé hledání, klepnutí na ověření ceny
nebo na odkaz k prodejci, založení a uložení cesty, sdílení, export do kalendáře, klepnutí u nabídky placené verze
(včetně toho, jakou cenu bys byl ochotný zaplatit) a odpovědi na krátké otázky (jen zvolená možnost). Server si navíc
sám ze svých odpovědí počítá, kde aplikace narazila: hledání bez výsledku, hledání odmítnuté kvůli limitu nebo plnému
serveru, hledání, které skončilo chybou, ubytování bez nabídek, otevření sdíleného odkazu a odkaz, který neexistuje
nebo vypršel, a přijaté hlášení chyby aplikace (bod 3.3).

- **Co se posílá:** jen název události z pevného seznamu (např. `search_done`). Počty „kde aplikace narazila“ si server
  udělá sám ze svých odpovědí, aplikace k tomu nic neposílá. Neposílá se, co jsi hledal nebo napsal, kam jedeš, ceny
  ani nic o tobě.
- **Co se ukládá:** jedno číslo na den a událost (např. „12. 1. 2027 – hledání: 148“). Neukládá se IP adresa, údaje
  o prohlížeči ani zařízení, čas jednotlivé události ani žádný identifikátor. Události nejde spojit mezi sebou ani
  s tebou – nejde zjistit, kdo co dělal, ani že dvě události udělal tentýž člověk.
- **V tvém zařízení:** nic. Počítání nepoužívá cookies, úložiště prohlížeče ani jiný identifikátor a bez připojení
  se nepočítá.
- **IP adresa** poslouží jen ochraně proti přetížení podle bodu 3.1 (nejvýš 120 událostí za 10 minut z jedné adresy,
  z toho nejvýš 30 stejných); k počtům se neukládá.
- **Kde a jak dlouho:** databáze Upstash Redis (jako krátké odkazy), 400 dní, pak je Upstash sám smaže; počty
  z posledních nejvýš 30 minut čekají na zápis v paměti serveru. Součty vidí jen provozovatel – stránka statistik
  a `/api/stats` jsou za klíčem. [ověřit – klíč `STATS_KEY` musí být na serveru nastavený před spuštěním, bez něj
  jsou součty veřejné]
- **Krátké otázky:** na pár místech se aplikace zeptá jednou krátkou otázkou. Odpověď je dobrovolná a pošle se, jen
  když sám klepneš na některou možnost; ✕ otázku zavře a nic se nepošle. Počítá se jen zvolená možnost (jako jiné
  události výš) a v zařízení se nic neukládá – jen nabídka Letsi Plus si pamatuje den, kdy se naposledy zeptala na
  cenu (`atlas_price_q`, bod 4), aby se znovu zeptala nejdřív za 30 dní. Krátké otázky testovací verze na Přehledu
  (nejvýš jedna denně) si pamatují jen počet dní s návštěvou a které otázky už padly (`atlas_ask`, bod 4), samotnou
  odpověď ne. Volný text („Jiné – napiš“) se na server neposílá – jen se nabídne e-mail podle bodu 5.5.
- **Právní základ:** souhrnné počty nejsou osobní údaje – nevztahují se k určené ani určitelné osobě. Samotné
  přijetí požadavku (IP adresa) viz bod 3.1. [ověřit – viz Otázky, bod 13]

> Kde v kódu: `public/js/count.js` (`hit()` – tělo `{ e }`, žádné úložiště prohlížeče), `server/lib/counts.js`
> (`EVENTS`, `SERVER_EVENTS` – počty, které dělá jen server a z prohlížeče se nepřijmou; `makeCounter()` – klíč
> `cnt:<den UTC>:<událost>`, `TTL_DAYS = 400`, zápis jednou za `FLUSH_MS` = 30 min; `hit()` dostane jen název události),
> `server/index.js` obsluha `/api/count` (limity `countHits` a `countPairs`, tělo nejvýš 256 bajtů), `/api/stats`
> (klíč `STATS_KEY`, `statsKeyOk()`) a serverové počty v `handleSearch()`, `streamSearch()` (`searchEvent()`),
> `/api/stays`, `/api/share/<id>` a `/api/client-error`, `test/pocitadla.test.js`.

### 3.7 Záznam průchodu návštěvou (jen se souhlasem)

Když v Další zapneš **Pomáhat se zlepšováním** (nebo na kartě na Přehledu klepneš na Zapnout), aplikace při každé
návštěvě posílá pořadí obrazovek a hlavních akcí z bodu 3.6 (bez nabídky placené verze, průzkumu ceny a odpovědí na
otázky) a opakované klepnutí na totéž místo, když něco nereaguje (jen sekce aplikace, ne co bylo pod prstem), se
sekundami od začátku a náhodným číslem návštěvy, které existuje jen v paměti otevřené stránky a po 30 minutách
nečinnosti se mění. Neposílá se text, místa, ceny, údaje cestujících, IP adresa ani údaje o prohlížeči. Jde
o pseudonymní údaje. Se souhlasem se zároveň počítají i podrobnější souhrnné počty z aplikace (jako v bodě 3.6), bez
něj se neposílají.

- **Účel:** zlepšování aplikace (kde návštěvy končí, co lidé dělali před odchodem). Vyhodnocuje se jen souhrnně,
  žádné profilování ani přizpůsobování obsahu; jednotlivé návštěvy se neprohlížejí.
- **Základ:** souhlas (čl. 6 odst. 1 písm. a) GDPR). Ve výchozím stavu je vypnuto.
- **Zpracovatelé:** Upstash (region [doplnit region]), Render, Cloudflare; předání do USA viz bod 6.
- **Uložení:** nejvýš 300 návštěv denně; záznamy jednoho dne se smažou 30 dní po posledním zápisu toho dne, tedy
  nejpozději do 31 dnů. Záznam čeká na zápis nejvýš 30 minut v paměti serveru. Číst je může jen provozovatel
  (stránka statistik za klíčem).
- **Odvolání:** souhlas můžeš kdykoli odvolat vypnutím v Další (nebo v O aplikaci), aniž by to ovlivnilo dřívější
  zpracování (čl. 7 odst. 3). Záznam právě probíhající návštěvy se tím smaže. Dřívější záznamy k tobě nedokážu
  přiřadit (čl. 11), proto nejdou smazat jednotlivě a vyprší samy.
- **Stížnost:** u ÚOOÚ (bod 7). [ověřit – Otázky, bod 14]

> Kde v kódu: `public/js/count.js` (`consent()`, `deep()`, `rageTap()`, záznam jen v paměti, odeslání přes
> `sendBeacon` na `/api/trace` při odchodu ze stránky), `server/lib/traces.js` (`cleanTrace()` – jen ID a názvy
> z pevného seznamu, `makeTraces()` – strop `CAP` = 300, `TTL_SEC` = 30 dní, odvolání HDEL), `server/index.js`
> obsluha `/api/trace` (limit 30 za 10 minut z adresy, tělo nejvýš 4 KB) a `/api/traces` (jen s klíčem `STATS_KEY`),
> karta a přepínač v `public/js/app.js` (`helpCard()`, `helpSwitch()`), `test/traces.test.js`.

## 4. Co zůstává jen ve tvém zařízení

Letsi ukládá data v úložišti prohlížeče (localStorage) na tvém zařízení. Provozovatel k nim nemá přístup a na server
se neposílají (kromě případů v bodě 3, kdy je sám odešleš). **Nejsou to cookies** a nic z toho neslouží ke sledování.

| Klíč | Co obsahuje |
|---|---|
| `atlas_v1` | hlavní stav: uložené cesty (i 🔖 kódy rezervací, které si zapíšeš), hlídané ceny, odložené nabídky, domov, navštívené země, oblíbená a skrytá místa, naposledy prohlížené, poslední hledání, motiv, čas poslední zálohy, uložené kurzy a počasí |
| `atlas_last` | výsledky posledního hledání letů |
| `atlas_draft` | rozepsané hledání |
| `atlas_prices_v…` | kontrola hlídaných cen (poslední zjištěné ceny) |
| `atlas_explore_v…` | stav Objevuj (místo, plán) |
| `atlas_pretrip_v…` | „Co zařídit a co sbalit“ (odškrtnutí) |
| `atlas_budget`, `atlas_plancard` | rozpočet a karta plánu v průvodci Cestou |
| `atlas_ph…` | mezipaměť adres fotek měst (starší verze klíče aplikace sama smaže) |
| `atlas_nowwx` | předpověď pro kartu Dnes na cestě (i bez signálu) |
| `atlas_wn`, `atlas_wn_top`, `atlas_since`, `atlas_tip`, `atlas_flags` | co už jsi viděl v Novinkách a tipech, technické příznaky zobrazení |
| `atlas_price_q` | den, kdy se nabídka Letsi Plus naposledy zeptala na cenu (za 30 dní se zeptá znovu) |
| `atlas_sesit_card` | karty Sešitu, které jsi skryl |
| `atlas_ask` | krátké otázky testovací verze: počet dní s návštěvou, den a otázka ukázaná naposledy, které otázky už jsi zodpověděl (ne co) a v kolika dnech se ukázaly |
| `atlas_look` | volba vzhledu (`atlas` po otevření adresy s `?vzhled=atlas`, `?vzhled=letsi` ji smaže) |
| `atlas_help` | tvoje volba u Pomáhat se zlepšováním (`1` zapnuto, `0` vypnuto) – zapíše se až po klepnutí, nic dalšího (číslo návštěvy ne) |

Pro práci bez internetu si aplikace (service worker) ukládá v mezipaměti prohlížeče **soubory aplikace** a čas
posledního spojení se serverem – žádné osobní údaje ani odpovědi na hledání.

Data smažeš vymazáním dat webu v nastavení prohlížeče nebo odinstalováním aplikace. Přenést je můžeš sám:
**💾 Záloha** (soubor ve tvém zařízení) nebo **📲 Přenést do jiného zařízení** (odkaz s QR kódem, data jsou v části
adresy za `#` a obsahují i kódy rezervací – posílej ho jen sobě).

- **Právní základ:** ukládání je nezbytné k funkcím, které sám používáš (§ 89 odst. 3 zákona č. 127/2005 Sb.,
  o elektronických komunikacích). [ověřit – viz Otázky, bod 6]

> Kde v kódu: `public/js/app.js` (`LS = 'atlas_v1'`, `defState()`, `save()`), klíče `atlas_*` v `public/js/*.js`
> (`flights.js`, `pricecheck.js`, `places.js`, `pretrip.js`, `trip.js`, `since.js`, `flags.js`, `plus.js`),
> `public/index.html` (`atlas_look`), `public/js/backup.js`,
> `public/js/transfer.js`, `public/sw.js` (do `/api/*` a cizích webů se nemíchá). `document.cookie` ani `indexedDB`
> aplikace nepoužívá.

## 5. Komu se údaje dostanou

### 5.1 Služby, kam se ptá přímo tvůj prohlížeč

Tyto služby dostanou tvou **IP adresu** a identifikaci prohlížeče, jako u každého obsahu načteného z cizího webu:

| Služba | Proč | Kdy |
|---|---|---|
| **OpenFreeMap** | podklad map | když otevřeš mapu |
| **Wikimedia Commons**, **Unsplash**, **Pexels** | fotky měst a míst | na kartách cílů a v programu |
| weby hotelů a jejich obrázkové servery (přes LiteAPI, TripAdvisor) | fotky ubytování | v nabídce ubytování |

Mapy.com (turistická mapa, návrhy míst, trasy), předpověď počasí a směnné kurzy (ExchangeRate-API) jdou **přes server
Letsi** – tyto služby tvou IP adresu nevidí; i logo Mapy.com je uložené na serveru Letsi. Písma (Onest a Unbounded vzhledu Letsi, Caveat na kartě ke sdílení, Inter a Sora staršího vzhledu) jsou na serveru Letsi, Google Fonts se nepoužívá.

> Kde v kódu: `public/css/atlas.css` (písma z `public/vendor/fonts`), `public/js/app.js` (kurzy z `/api/fx`, zdroje
> fotek), `public/js/places.js` (`tiles.openfreemap.org`; logo Mapy.com `MAPY_LOGO` z `public/vendor/mapy-logo.svg`), `server/lib/photos.js` (Wikimedia, Pexels, Unsplash – fotky se vkládají přímo z jejich serverů),
> `server/lib/security.js` (CSP: `connect-src`, `font-src`, `img-src https:`).

### 5.2 Služby, kterých se ptá jen server Letsi

Server se jich ptá **bez tvé IP adresy a bez čehokoli, co by tě identifikovalo** – dostanou jen obsah dotazu
(např. trasu a datum letu, místo a termín ubytování, souřadnice místa):

- ceny letů: **Ryanair**, **Wizz Air**, **Kiwi.com**, **Travelpayouts / Aviasales**,
- ubytování: **Xotelo** (data TripAdvisoru), **LiteAPI** (je-li zapnuté), OpenStreetMap (Nominatim),
- vlak a bus: **RegioJet**,
- počasí: **MET Norway** (souřadnice zaokrouhlené na 2 desetinná místa),
- mapy, místa a trasy: **Mapy.com** (Seznam.cz, a.s.), BRouter, Overpass (OpenStreetMap), Wikidata, Wikipedie
  (místa v okolí dostanou souřadnice zaokrouhlené nejvýš na 3 desetinná místa, asi 100 m),
- fotky: Wikimedia, Pexels, Unsplash; kurzy a palivo: ECB, ČSÚ, Evropská komise.

> Kde v kódu: `server/providers/` (`ryanair.js`, `wizzair.js`, `kiwi.js`, `travelpayouts.js`, `stays/`),
> `server/lib/weather.js`, `server/lib/mapy.js` (dlaždice, návrhy a trasy přes server, neukládají se),
> `server/lib/brouter.js`, `server/lib/poi.js`, `server/lib/photos.js`, `server/lib/fx.js`, `server/lib/fuel.js`;
> `server/lib/http.js` `request()` – požadavky ven mají vlastní hlavičky serveru, hlavičky ani IP klienta se nepředávají.

### 5.3 Partnerské odkazy a rezervace

Letsi letenky, ubytování ani auta neprodává. Tlačítka **Koupit** a odkazy k rezervaci tě pošlou na web prodejce
(aerolinka, Kiwi.com, Booking.com, Airbnb, Trip.com, Agoda, Hostelworld, půjčovny aut…) s předvyplněným hledáním
(místo, termín, počet osob). Tam už platí zásady prodejce. Některé odkazy (Aviasales, Booking.com, DiscoverCars) jsou
**partnerské** – vedou přes zprostředkovatele Travelpayouts (`tp.media`) a jsou v aplikaci označené
štítkem „reklama“. Při nákupu přes ně může provozovatel dostat provizi; partner se dozví, že jsi přišel z Letsi.
Provozovatel od partnera nedostává údaje o tobě, jen souhrnné údaje o provizích. [ověřit – viz Otázky, bod 7]

> Kde v kódu: `server/lib/links.js` (`tp.media`, jen s `TRAVELPAYOUTS_MARKER` a `TRAVELPAYOUTS_TRS`),
> `public/js/trip.js` a `public/js/app.js` (štítek `ad-tag` „reklama“, `rel="sponsored"`), `public/js/about.js`.
> Hlavička `Referrer-Policy: strict-origin-when-cross-origin` – partner dostane jen adresu webu Letsi, ne stránku
> (`server/lib/security.js`).

### 5.4 Příspěvek přes Stripe (💛 Podpořit Letsi)

Dobrovolný příspěvek se platí na platební stránce **Stripe** (Stripe Payments Europe, Ltd., Irsko), kam tě tlačítko
pošle. Údaje o kartě zpracovává jen Stripe; aplikace ani server Letsi je nedostanou. Provozovatel ve Stripe vidí
údaje k přijaté platbě (jméno, e-mail, částku a poslední 4 číslice karty) a uchovává je po dobu, kterou
ukládají předpisy o účetnictví a daních [doplnit – např. 10 let].

- **Právní základ:** plnění smlouvy a právní povinnost (čl. 6 odst. 1 písm. b) a c) GDPR).

> Kde v kódu: `server/config.js` (`cleanPayUrl` – jen `https://buy.stripe.com/…`), `public/js/about.js` (`okPay`),
> proměnná `SUPPORT_URL`; bez ní se tlačítko neukáže.

### 5.5 Zpětná vazba e-mailem (💬 Napsat nám)

Tlačítko (i odkaz „Napiš, co ti vadí“ u značky Testovací verze a „Jiné – napiš“ u krátké otázky) otevře tvůj
e-mailový program se zprávou na adresu provozovatele (předmět obsahuje verzi aplikace a obrazovku, u krátké otázky
je v textu zprávy předvyplněná otázka a tvoje odpověď). Odeslání je jen na tobě. Provozovatel uvidí tvou e-mailovou adresu a obsah zprávy a použije je jen k odpovědi. Zprávy uchovává
[doplnit – např. 2 roky od poslední komunikace].

- **Právní základ:** oprávněný zájem odpovědět na tvůj dotaz (čl. 6 odst. 1 písm. f) GDPR).

> Kde v kódu: `public/js/about.js` (`mailto`, `subject`), `public/js/otazky.js` (`addToMenu`, `render`), `server/config.js` (`cleanEmail`), proměnná `FEEDBACK_EMAIL`
> (adresa v kódu není).

## 6. Předávání mimo EU

- **Render** (hosting, USA): server v regionu Frankfurt (EU); Render Services, Inc. je společnost z USA.
  [doplnit – smluvní doložky / EU-US Data Privacy Framework]
- **Cloudflare** (síť doručení před Renderem, USA). [doplnit]
- **Upstash** (krátké odkazy, souhrnné počty a se souhlasem i pseudonymní záznamy návštěv podle bodu 3.7): region
  databáze [doplnit region]; Upstash, Inc. je společnost z USA. [doplnit – smlouva o zpracování (DPA), EU-US Data
  Privacy Framework]
- Služby fotek a map v bodě 5.1 mohou mít servery i mimo EU.

## 7. Tvoje práva

Máš právo na přístup k osobním údajům, jejich opravu, výmaz, omezení zpracování, přenositelnost a právo vznést
námitku proti zpracování na základě oprávněného zájmu (čl. 15–21 GDPR). Napiš na [e-mail].

Upozorňujeme, že u většiny údajů tě nedokážeme identifikovat: nemáme účty a IP adresu držíme jen v paměti po dobu
podle bodu 3.1. Data v tvém zařízení (bod 4) smažeš sám. U krátkého odkazu nám pro výmaz pošli odkaz (`…/c/…`).
Souhlas se záznamem návštěvy (bod 3.7) odvoláš vypnutím Pomáhat se zlepšováním v Další – smaže se tím i záznam
právě probíhající návštěvy; starší záznamy k tobě nedokážeme přiřadit (čl. 11 GDPR) a vyprší samy do 31 dnů.

Máš právo podat stížnost u **Úřadu pro ochranu osobních údajů**, Pplk. Sochora 27, 170 00 Praha 7, www.uoou.gov.cz.

Nepoužíváme automatizované rozhodování ani profilování (záznamy návštěv podle bodu 3.7 se vyhodnocují jen souhrnně). Poskytnutí údajů není povinné; bez údajů o hledání ti ale
Letsi nemůže najít spoje.

## 8. Změny zásad

Zásady můžeme upravit, když se změní aplikace nebo předpisy. Aktuální znění je vždy v aplikaci
(⋯ Další → ℹ️ O aplikaci a soukromí) a na adrese https://letsi.cz/soukromi, s datem účinnosti.

Účinné od: [datum]

---

## Otázky pro advokáta

1. **Doba uchování IP adresy.** V kódu vyřešeno: úklid (`RateLimiter.sweep` v `server/lib/ratelimit.js`, každých
   30 s) smaže adresu nejpozději po uplynutí okna od posledního požadavku – 10 minut, u hlášení chyb, nových krátkých
   odkazů a špatného klíče ke statistikám 60 minut. Okno „O aplikaci a soukromí“ říká „nejdéle hodinu od posledního
   požadavku (u hledání 10 minut)“. Stačí to takto?
2. **Hlášení chyb bez souhlasu.** Odesílá se automaticky hned při načtení (`errlog.js` v `<head>`). Obsah je očištěný,
   ale požadavek nese IP adresu a v logu Renderu se dá spojit s řádkem hlášení podle času. Stačí oprávněný zájem
   a informace v zásadách, nebo je třeba hlášení vypnout do souhlasu? Text chyby se čistí jen od e-mailů a čísel –
   jména nebo jiné texty, které uživatel napsal, by v chybové zprávě teoreticky zůstat mohly.
3. **Co přesně obsahuje sdílená cesta.** Kódy rezervací a kód jízdenky `shareJson()` v `public/js/trip.js` dnes
   výslovně vynechává (`refs`, `rides`, `kod`); kód jízdenky z plánovače jde jen do vlastní zálohy
   (`public/js/planshare.js`). Jde ale o seznam *vynechaných* polí, ne povolených – pole nové funkce se do odkazu
   dostane, dokud ho někdo nevynechá. Sdílená cesta nese i vlastní název cesty a poznámky, které uživatel napsal
   (může tam být jméno). Stačí na to upozornit v bodě 3.4?
4. **Smazání krátkého odkazu.** Aplikace nemá žádný způsob, jak uložený odkaz smazat před uplynutím 400 dní (Upstash
   umí jen `SET` a `GET`, `server/lib/shortlinks.js`). Výmaz na žádost by provozovatel musel udělat ručně v konzoli
   Upstash. Je to přijatelné, nebo je třeba tlačítko „Zrušit odkaz“? Je 400 dní přiměřená doba? Odpověď
   `/api/share/<id>` je navíc veřejně cacheovatelná 1 den – po smazání může kopie chvíli přežít.
5. **Role Renderu, Cloudflare a Upstash, předávání do USA.** Je potřeba se zpracovateli uzavřít smlouvu (DPA)
   a ověřit, zda jsou certifikováni v EU-US Data Privacy Framework. Region Upstash není v kódu ani v `render.yaml`
   (jen v proměnné `UPSTASH_REDIS_REST_URL` na Renderu) – provozovatel ho musí doplnit. Dobu uchovávání logů Renderu
   (HTTP request logs i výstup aplikace) je třeba zjistit podle tarifu.
6. **localStorage a § 89 odst. 3 ZEK.** Ukládání považujeme za nezbytné pro funkce, o které uživatel požádal. Platí to
   i pro mezipaměť fotek, „Novinky“ a tipy (`atlas_ph`, `atlas_wn`, `atlas_tip`)? Lišta souhlasu dnes není žádná.
7. **Partnerské odkazy.** Zprostředkovatel Travelpayouts a partneři mohou na svém webu nastavit vlastní cookies
   a sledovat konverzi – Letsi to neovlivní. Je třeba to výslovně uvést? Je označení „reklama“ u odkazu dostatečné
   (zákon o ochraně spotřebitele, § 2976 občanského zákoníku, DSA)?
8. **Čistý režim:** písma jsou z vlastního serveru (#420), kurzy jdou přes server (`/api/fx`) a záložní dlaždice
   tile.openstreetmap.org aplikace už nebere – prohlížeč se přímo ptá jen OpenFreeMap a zdrojů fotek.
9. **Údaje v adrese (`?…`) v logu hostingu.** Některé dotazy jsou GET s parametry (např. našeptávač míst `?q=…`,
   souřadnice u počasí a míst, pozvánka `/j/<data>` s cílem a místem odletu v cestě adresy). Ty se mohou objevit
   v logu Renderu a Cloudflare spolu s IP adresou. Stačí to uvést v zásadách?
10. **Oslovení.** Aplikace uživateli tyká; zásady jsou psané stejně. Je to v pořádku, nebo vykat?
11. **Pověřenec a záznamy o činnostech zpracování** (čl. 30 GDPR) – jsou u fyzické osoby podnikatele s tímto rozsahem
    potřeba?
12. **Stripe** – je provozovatel vůči Stripe samostatným správcem, nebo Stripe zpracovatelem? Který subjekt Stripe
    (Irsko / USA) je smluvní stranou podle účtu provozovatele?
13. **Souhrnné denní počty bez souhlasu** (bod 3.6). Server počítá jen denní součty událostí bez IP adresy,
    identifikátoru a bez čehokoli uloženého v zařízení (žádné cookies ani localStorage). Stačí to k závěru, že nejde
    o osobní údaje ani o přístup do koncového zařízení podle § 89 odst. 3 ZEK, takže souhlas není potřeba? Součty
    nově vidí jen provozovatel (`/api/stats` za klíčem `STATS_KEY`) – stačí to, nebo vadí i to, že jemné denní součty
    vidí on?
    - **Klientské počty.** Spadá klientský JavaScript bez cookies, který sám pošle název události z pevného seznamu
      (otevření aplikace a sekce, klepnutí, výsledek hledání; plánovaně i klepnutí na části aplikace a stav sítě),
      pod § 89 odst. 3 ZEK ve výkladu EDPB 2/2023? Stačí přístup podle rizika? Týká se to i dnešních 33 počtů na
      produkci. Počty, které si server dělá sám ze svých odpovědí (hledání bez výsledku, limit, chyba, nefunkční
      sdílený odkaz), od prohlížeče nic navíc nepotřebují. Odpověď je potřeba před rozšířením klientských počtů,
      zhruba do poloviny prosince 2026.
    - **Záložní cesta při „souhlas nutný“:** všechny klientské počty (dnešní i nové) poběží jen po zapnutí přepínače
      v Další (např. „Pomáhat se zlepšováním“) a text 3.6 se upraví. Serverové počty zůstanou bez souhlasu.
    - **Krátké otázky:** odpověď pošle člověk sám klepnutím na možnost (✕ otázku zavře bez odeslání). Je to jiná
      situace než automaticky odeslaný počet?
    - **Události odvozené z uloženého stavu** (`limit_shown`, `plus_offer_shown`, `sesit_shown` – ukážou se podle toho,
      co má aplikace uložené v localStorage, např. počet cest): stejné posouzení jako u klientských počtů, nebo jiné?
14. **Záznam průchodu návštěvou se souhlasem** (bod 3.7, karta na Přehledu a přepínač Pomáhat se zlepšováním).
    Prosím o přečtení textu karty a bodu 3.7. Dále: souhlas dětí pod 15 let (čl. 8 GDPR, § 7 zák. 110/2019 Sb.);
    stačí čl. 11 pro minulé návštěvy (ID existuje jen v paměti stránky); je potřeba DPIA nebo záznam podle čl. 30
    („monitorování chování“ na seznamu ÚOOÚ; rozsah je malý – nejvýš 300 návštěv denně); po jaké době souhlas
    obnovit (dnes platí do vypnutí); smlouva o zpracování s Upstash, jeho certifikace v EU-US Data Privacy Framework
    a region databáze. Podrobné klientské počty (nové počty z Letů, průvodce, Objevuj a Přehledu a opakované klepnutí)
    se rozhodnutím provozovatele posílají jen s tímto souhlasem – stačí pro ně text karty, nebo je vyjmenovat?
    Ukázku jednotlivých návštěv na stránce statistik zatím nestavím – je přípustná?
