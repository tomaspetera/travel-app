# Zásady ochrany osobních údajů – ATLAS (návrh pro advokáta)

> **Návrh, ne platný text.** Sepsáno podle skutečného chování kódu ke dni 16. 11. 2026 (podmínka spuštění č. 3
> z plánu 1.2). Každé tvrzení o zpracování má v poznámce pod oddílem odkaz do kódu, kde se dá ověřit. Údaje
> v hranatých závorkách doplní provozovatel – repozitář je veřejný, proto v něm skutečné osobní údaje nejsou.
> Poznámky „Kde v kódu“ a oddíl Otázky pro advokáta do zveřejněné verze nepatří.

## 1. Kdo údaje zpracovává

Správcem osobních údajů je provozovatel aplikace ATLAS (web https://atlas-letenky.onrender.com a aplikace na plochu
z něj nainstalovaná):

- [jméno a příjmení]
- IČO: [IČO]
- adresa: [adresa]
- e-mail: [e-mail]

Pověřence pro ochranu osobních údajů nemáme jmenovaného (není povinný). [ověřit – viz Otázky]

## 2. Krátce

- ATLAS nemá účty, registraci ani přihlášení. **Nepoužívá cookies, analytiku ani měření návštěvnosti.**
- Tvoje cesty, hlídané ceny, oblíbená místa a nastavení jsou **jen v tvém prohlížeči** na tvém zařízení. Na server se
  neposílají.
- Server ATLASu dostane jen to, co potřebuje k odpovědi (např. odkud a kam hledáš let), a tvou IP adresu, kterou
  krátce drží v paměti kvůli ochraně proti přetížení.
- Na serveru se trvale ukládá jen cesta, kterou **sám sdílíš krátkým odkazem** – na 400 dní.
- Letenky ani ubytování neprodáváme. Když klepneš na odkaz k rezervaci, přejdeš na web prodejce a platí jeho zásady.

## 3. Co přijímá server ATLASu a jak dlouho to drží

### 3.1 IP adresa – ochrana proti přetížení

Server u většiny dotazů (hledání letů, ubytování, fotky, počasí, mapy, sdílení, hlášení chyb) počítá, kolik požadavků
přišlo z jedné adresy, a nad limitem další na chvíli odmítne. K tomu si pamatuje IP adresu (u IPv6 jen síť /64,
tedy prvních 64 bitů) a časy posledních požadavků z ní.

- **Kde:** jen v operační paměti serveru, nikam se nezapisuje (žádný soubor ani databáze).
- **Jak dlouho:** započítávají se požadavky za posledních 10 minut (u hlášení chyb a u vytváření krátkých odkazů za
  posledních 60 minut). Starší časy se už nepoužívají; záznam adresy z paměti zmizí při dalším požadavku z ní, při
  úklidu po překročení 5 000 adres nebo nejpozději při restartu serveru. Server se na bezplatném tarifu hostingu uspí
  po 15 minutách bez návštěvy a paměť se tím vymaže. [ověřit – viz Otázky, bod 1]
- **Účel a právní základ:** ochrana služby a zdrojů dat před zahlcením a zneužitím – oprávněný zájem (čl. 6 odst. 1
  písm. f) GDPR).

> Kde v kódu: `server/lib/ratelimit.js` (třída `RateLimiter`, okno 10 min, strop 5 000 adres, `prune`),
> `server/index.js` funkce `rateLimited()` a seznam limitů (`clientErrs` a `shareHits` s oknem 60 min),
> `server/lib/security.js` funkce `clientIp()` a `ipKey()` (IPv6 → /64, adresa z hlavičky `CF-Connecting-IP`),
> `render.yaml` (`plan: free`, usínání po 15 min). Zápis na disk server nemá (`writeFile`/`appendFile` se v `server/`
> nepoužívá).

### 3.2 Obsah dotazů

Aby ATLAS mohl odpovědět, posílá prohlížeč serveru údaje o hledání: odkud a kam, termín, počet cestujících (dospělí,
děti, miminka), zavazadla, způsob cesty na letiště a výchozí místo (domov), u ubytování místo, termín a počet hostů,
v Objevuj místo a volby programu. **Polohu zařízení** prohlížeč zjistí a použije jen tehdy, když sám klepneš na
📍 Moje poloha nebo Moje okolí (prohlížeč se tě nejdřív zeptá na povolení).

Server odpovědi drží chvíli v mezipaměti v operační paměti (podle dotazu, ne podle uživatele – IP adresa ani jiný
identifikátor v ní není), aby stejný dotaz nemusel znovu ke zdrojům dat.

- **Právní základ:** poskytnutí služby, o kterou žádáš (čl. 6 odst. 1 písm. b) GDPR).

> Kde v kódu: `public/js/about.js` (oddíl „Co se na server posílá“, hlídá ho `test/about.test.js`),
> `server/lib/cache.js` (mezipaměť v paměti), poloha jen na klepnutí `public/js/flights.js` a `public/js/places.js`
> (`navigator.geolocation.getCurrentPosition`).

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
rezervací a čas založení. [ověřit kódy rezervací – viz Otázky, bod 3]

- **Kde:** databáze Upstash Redis (Upstash, Inc.), region [doplnit region]; kopii nejvýš 300 nedávno otevřených
  odkazů drží server ATLASu v paměti do restartu. Prohlížeč a síť doručení obsahu mohou otevřenou cestu
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
za `#`) a identifikaci prohlížeče. Do logu hostingu zapisuje i server ATLASu: provozní hlášky a hlášení chyb podle
bodu 3.3, **IP adresy ani obsah hledání sám nezapisuje**.

- **Jak dlouho:** [doplnit dobu uchovávání logů podle tarifu Renderu].
- **Právní základ:** oprávněný zájem na provozu a zabezpečení služby (čl. 6 odst. 1 písm. f) GDPR).

> Kde v kódu: `render.yaml` (`region: frankfurt`), `server/lib/security.js` (komentář u `clientIp()`: na Renderu
> Cloudflare a hlavička `CF-Connecting-IP`), výpisy `console.*` v `server/index.js` – žádný neobsahuje IP adresu.

## 4. Co zůstává jen ve tvém zařízení

ATLAS ukládá data v úložišti prohlížeče (localStorage) na tvém zařízení. Provozovatel k nim nemá přístup a na server
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
| `atlas_ph` | mezipaměť adres fotek měst |
| `atlas_nowwx` | předpověď pro kartu Dnes na cestě (i bez signálu) |
| `atlas_wn`, `atlas_wn_top`, `atlas_since`, `atlas_tip`, `atlas_flags` | co už jsi viděl v Novinkách a tipech, technické příznaky zobrazení |

Pro práci bez internetu si aplikace (service worker) ukládá v mezipaměti prohlížeče **soubory aplikace** a čas
posledního spojení se serverem – žádné osobní údaje ani odpovědi na hledání.

Data smažeš vymazáním dat webu v nastavení prohlížeče nebo odinstalováním aplikace. Přenést je můžeš sám:
**💾 Záloha** (soubor ve tvém zařízení) nebo **📲 Přenést do jiného zařízení** (odkaz s QR kódem, data jsou v části
adresy za `#` a obsahují i kódy rezervací – posílej ho jen sobě).

- **Právní základ:** ukládání je nezbytné k funkcím, které sám používáš (§ 89 odst. 3 zákona č. 127/2005 Sb.,
  o elektronických komunikacích). [ověřit – viz Otázky, bod 6]

> Kde v kódu: `public/js/app.js` (`LS = 'atlas_v1'`, `defState()`, `save()`), klíče `atlas_*` v `public/js/*.js`
> (`flights.js`, `pricecheck.js`, `places.js`, `pretrip.js`, `trip.js`, `since.js`, `flags.js`), `public/js/backup.js`,
> `public/js/transfer.js`, `public/sw.js` (do `/api/*` a cizích webů se nemíchá). `document.cookie` ani `indexedDB`
> aplikace nepoužívá.

## 5. Komu se údaje dostanou

### 5.1 Služby, kam se ptá přímo tvůj prohlížeč

Tyto služby dostanou tvou **IP adresu** a identifikaci prohlížeče, jako u každého obsahu načteného z cizího webu:

| Služba | Proč | Kdy |
|---|---|---|
| **Google Fonts** (Google Ireland Ltd. / Google LLC) | písmo aplikace (Inter, Sora; Caveat u karty na sítě) | při každém otevření – **odstraňuje se, písmo bude z vlastního serveru** |
| **OpenFreeMap**, záložně **OpenStreetMap** (tile.openstreetmap.org) | podklad map | když otevřeš mapu |
| **Wikimedia Commons**, **Unsplash**, **Pexels** | fotky měst a míst | na kartách cílů a v programu |
| weby hotelů a jejich obrázkové servery (přes LiteAPI, TripAdvisor) | fotky ubytování | v nabídce ubytování |
| **open.er-api.com** (ExchangeRate-API) | směnné kurzy | v okně země, nejvýš jednou denně |

Mapy.com (turistická mapa, návrhy míst, trasy) a předpověď počasí jdou **přes server ATLASu** – tyto služby tvou IP
adresu nevidí.

> Kde v kódu: `public/index.html` (odkazy na `fonts.googleapis.com`), `public/js/sharecard.js` (písmo Caveat),
> `public/js/places.js` (`tiles.openfreemap.org`, `tile.openstreetmap.org`), `public/js/app.js` (`open.er-api.com`,
> zdroje fotek), `server/lib/photos.js` (Wikimedia, Pexels, Unsplash – fotky se vkládají přímo z jejich serverů),
> `server/lib/security.js` (CSP: `connect-src`, `font-src`, `img-src https:`).

### 5.2 Služby, kterých se ptá jen server ATLASu

Server se jich ptá **bez tvé IP adresy a bez čehokoli, co by tě identifikovalo** – dostanou jen obsah dotazu
(např. trasu a datum letu, místo a termín ubytování, souřadnice místa):

- ceny letů: **Ryanair**, **Wizz Air**, **Kiwi.com**, **Travelpayouts / Aviasales**,
- ubytování: **Xotelo** (data TripAdvisoru), **LiteAPI** (je-li zapnuté), OpenStreetMap (Nominatim),
- vlak a bus: **RegioJet**,
- počasí: **MET Norway** (souřadnice zaokrouhlené na 2 desetinná místa),
- mapy, místa a trasy: **Mapy.com** (Seznam.cz, a.s.), BRouter, Overpass (OpenStreetMap), Wikidata, Wikipedie,
- fotky: Wikimedia, Pexels, Unsplash; kurzy a palivo: ECB, ČSÚ, Evropská komise.

> Kde v kódu: `server/providers/` (`ryanair.js`, `wizzair.js`, `kiwi.js`, `travelpayouts.js`, `stays/`),
> `server/lib/weather.js`, `server/lib/mapy.js` (dlaždice, návrhy a trasy přes server, neukládají se),
> `server/lib/brouter.js`, `server/lib/poi.js`, `server/lib/photos.js`, `server/lib/fx.js`, `server/lib/fuel.js`;
> `server/lib/http.js` `request()` – požadavky ven mají vlastní hlavičky serveru, hlavičky ani IP klienta se nepředávají.

### 5.3 Partnerské odkazy a rezervace

ATLAS letenky, ubytování ani auta neprodává. Tlačítka **Koupit** a odkazy k rezervaci tě pošlou na web prodejce
(aerolinka, Kiwi.com, Booking.com, Airbnb, Trip.com, Agoda, Hostelworld, půjčovny aut…) s předvyplněným hledáním
(místo, termín, počet osob). Tam už platí zásady prodejce. Některé odkazy (Aviasales, Booking.com, DiscoverCars) jsou
**partnerské** – vedou přes zprostředkovatele Travelpayouts (`tp.media`) a jsou v aplikaci označené
štítkem „reklama“. Při nákupu přes ně může provozovatel dostat provizi; partner se dozví, že jsi přišel z ATLASu.
Provozovatel od partnera nedostává údaje o tobě, jen souhrnné údaje o provizích. [ověřit – viz Otázky, bod 7]

> Kde v kódu: `server/lib/links.js` (`tp.media`, jen s `TRAVELPAYOUTS_MARKER` a `TRAVELPAYOUTS_TRS`),
> `public/js/trip.js` a `public/js/app.js` (štítek `ad-tag` „reklama“, `rel="sponsored"`), `public/js/about.js`.
> Hlavička `Referrer-Policy: strict-origin-when-cross-origin` – partner dostane jen adresu webu ATLAS, ne stránku
> (`server/lib/security.js`).

### 5.4 Příspěvek přes Stripe (💛 Podpořit ATLAS)

Dobrovolný příspěvek se platí na platební stránce **Stripe** (Stripe Payments Europe, Ltd., Irsko), kam tě tlačítko
pošle. Údaje o kartě zpracovává jen Stripe; aplikace ani server ATLASu je nedostanou. Provozovatel ve Stripe vidí
údaje k přijaté platbě (jméno, e-mail, částku a poslední 4 číslice karty) a uchovává je po dobu, kterou
ukládají předpisy o účetnictví a daních [doplnit – např. 10 let].

- **Právní základ:** plnění smlouvy a právní povinnost (čl. 6 odst. 1 písm. b) a c) GDPR).

> Kde v kódu: `server/config.js` (`cleanPayUrl` – jen `https://buy.stripe.com/…`), `public/js/about.js` (`okPay`),
> proměnná `SUPPORT_URL`; bez ní se tlačítko neukáže.

### 5.5 Zpětná vazba e-mailem (💬 Napsat nám)

Tlačítko otevře tvůj e-mailový program se zprávou na adresu provozovatele (předmět obsahuje verzi aplikace
a obrazovku). Provozovatel uvidí tvou e-mailovou adresu a obsah zprávy a použije je jen k odpovědi. Zprávy uchovává
[doplnit – např. 2 roky od poslední komunikace].

- **Právní základ:** oprávněný zájem odpovědět na tvůj dotaz (čl. 6 odst. 1 písm. f) GDPR).

> Kde v kódu: `public/js/about.js` (`mailto`, `subject`), `server/config.js` (`cleanEmail`), proměnná `FEEDBACK_EMAIL`
> (adresa v kódu není).

## 6. Předávání mimo EU

- **Render** (hosting, USA): server v regionu Frankfurt (EU); Render Services, Inc. je společnost z USA.
  [doplnit – smluvní doložky / EU-US Data Privacy Framework]
- **Cloudflare** (síť doručení před Renderem, USA). [doplnit]
- **Upstash** (krátké odkazy): region databáze [doplnit region]; Upstash, Inc. je společnost z USA. [doplnit]
- **Google Fonts** (do odstranění): Google LLC, USA. [doplnit]
- Služby fotek a map v bodě 5.1 mohou mít servery i mimo EU.

## 7. Tvoje práva

Máš právo na přístup k osobním údajům, jejich opravu, výmaz, omezení zpracování, přenositelnost a právo vznést
námitku proti zpracování na základě oprávněného zájmu (čl. 15–21 GDPR). Napiš na [e-mail].

Upozorňujeme, že u většiny údajů tě nedokážeme identifikovat: nemáme účty a IP adresu držíme jen v paměti po dobu
podle bodu 3.1. Data v tvém zařízení (bod 4) smažeš sám. U krátkého odkazu nám pro výmaz pošli odkaz (`…/c/…`).

Máš právo podat stížnost u **Úřadu pro ochranu osobních údajů**, Pplk. Sochora 27, 170 00 Praha 7, www.uoou.gov.cz.

Nepoužíváme automatizované rozhodování ani profilování. Poskytnutí údajů není povinné; bez údajů o hledání ti ale
ATLAS nemůže najít spoje.

## 8. Změny zásad

Zásady můžeme upravit, když se změní aplikace nebo předpisy. Aktuální znění je vždy v aplikaci
(⋯ Další → ℹ️ O aplikaci a soukromí) [doplnit odkaz] s datem účinnosti.

Účinné od: [datum]

---

## Otázky pro advokáta

1. **Doba uchování IP adresy.** Okno aplikace „O aplikaci a soukromí“ dnes říká „IP adresu si pamatuje 10 minut“.
   V kódu je okno 10 minut, u hlášení chyb a krátkých odkazů 60 minut, a záznam se z paměti fyzicky odstraní až při
   dalším požadavku ze stejné adresy, při přesažení 5 000 adres nebo restartu (`server/lib/ratelimit.js` – `prune`
   běží jen nad stropem). Na bezplatném Renderu se server po 15 minutách bez návštěvy uspí, na placeném tarifu ale
   adresa může v paměti zůstat dny. Stačí formulace „nejpozději do restartu serveru“, nebo má provozovatel zajistit
   pravidelné mazání po uplynutí okna (malá úprava kódu) a sjednotit text v aplikaci?
2. **Hlášení chyb bez souhlasu.** Odesílá se automaticky hned při načtení (`errlog.js` v `<head>`). Obsah je očištěný,
   ale požadavek nese IP adresu a v logu Renderu se dá spojit s řádkem hlášení podle času. Stačí oprávněný zájem
   a informace v zásadách, nebo je třeba hlášení vypnout do souhlasu? Text chyby se čistí jen od e-mailů a čísel –
   jména nebo jiné texty, které uživatel napsal, by v chybové zprávě teoreticky zůstat mohly.
3. **Co přesně obsahuje sdílená cesta.** `shareJson()` v `public/js/trip.js` je seznam *vynechaných* polí (odškrtnutí
   rezervací, čas založení), ne povolených. Kódy rezervací (`refs`) se zapisují k cestám v Moje cestách
   (`public/js/app.js` `refsHtml`) a sdílí se cesta z průvodce, kde podle kódu nejsou – výslovně se ale nevynechávají.
   Plánovač má u vlaku „místo a kód jízdenky“ (`public/js/planshare.js`) a není jasné, zda se s plánem neodesílají.
   Okno v aplikaci slibuje „bez jména a kódů rezervací“. Doporučuji technicky ověřit (a případně přepnout na seznam
   povolených polí) dříve, než se tento slib objeví v zásadách. Sdílená cesta může obsahovat i vlastní název cesty
   a poznámky, které uživatel napsal (může tam být jméno).
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
   a sledovat konverzi – ATLAS to neovlivní. Je třeba to výslovně uvést? Je označení „reklama“ u odkazu dostatečné
   (zákon o ochraně spotřebitele, § 2976 občanského zákoníku, DSA)?
8. **Rozpor s plánem čistého režimu a s CLAUDE.md:** písmo se stále načítá z **Google Fonts** (`public/index.html`,
   `public/js/sharecard.js`) – podle pravidel projektu má být z vlastního serveru (rozsudek LG München 20. 1. 2022,
   3 O 17493/20). Do spuštění odstranit, jinak zásady musí předání IP adresy Googlu popsat jako skutečnost, ne plán.
   Kurzy z **open.er-api.com** a dlaždice **tile.openstreetmap.org** jdou přímo z prohlížeče (IP uživatele u třetích
   stran) – zvážit, zda je neposílat přes server jako počasí a Mapy.com.
9. **Údaje v adrese (`?…`) v logu hostingu.** Některé dotazy jsou GET s parametry (např. našeptávač míst `?q=…`,
   souřadnice u počasí a míst, pozvánka `/j/<data>` s cílem a místem odletu v cestě adresy). Ty se mohou objevit
   v logu Renderu a Cloudflare spolu s IP adresou. Stačí to uvést v zásadách?
10. **Oslovení.** Aplikace uživateli tyká; zásady jsou psané stejně. Je to v pořádku, nebo vykat?
11. **Pověřenec a záznamy o činnostech zpracování** (čl. 30 GDPR) – jsou u fyzické osoby podnikatele s tímto rozsahem
    potřeba?
12. **Stripe** – je provozovatel vůči Stripe samostatným správcem, nebo Stripe zpracovatelem? Který subjekt Stripe
    (Irsko / USA) je smluvní stranou podle účtu provozovatele?
