# Texty pro Letsi – audit textů aplikace

Podklad k přejmenování ATLAS → **Letsi** („Leť si!“ / „let's see“). V aplikaci se zatím nic nemění – tady jsou návrhy,
podle kterých se texty přepíšou v samostatném PR (spolu s ikonou, náhledovým obrázkem a testy, které název kontrolují).

Stav: kód k 6. 11. 2026 (commit 460d7d5). Čísla řádků platí pro tenhle stav – před úpravou je ověř hledáním textu.

## Hlas Letsi v kostce

- **Vlídný kamarád, který se vyzná.** Tyká, mluví v první osobě („najdu“, „pohlídám“, „zkontroluji“), krátce a na rovinu.
- **Nikdy nekřičí slevy.** Žádné „super“, „🔥“, „neuvěřitelné“, vykřičníky u cen. Cena se popíše, ne prodává.
- **Důvěryhodný v penězích.** Vždy řekne, co je odhad, co je v ceně a co ne, a že platí cena u prodejce. Neslibuje
  „nejlevnější“ tam, kde to nemůže zaručit (zdroj může vypadnout – aplikace to sama hlásí).
- **Telefon (412 px) na prvním místě.** Nadpis do ~30 znaků, tlačítko do ~22 znaků, toast na 1–2 řádky (do ~70 znaků).

### Gramatika názvu (důležité pro náhradu „ATLASu“, „ATLASem“)

- **Letsi je nesklonné:** „v Letsi“, „z Letsi“, „server Letsi“, „Podpořit Letsi“, „Přidat Letsi na plochu“.
  Všechny tvary „ATLASu / ATLASem“ se tím nahradí jedním slovem.
- **Shodě rodu se vyhnout.** Místo „dokud máš Letsi otevřený/-ou“ psát „dokud máš aplikaci otevřenou“; místo
  „Letsi ti pomohl/-a“ psát „pomohlo ti to“. Rod u názvu by se četl pokaždé jinak.
- **První osoba bez minulého času s rodem.** Dnes aplikace mluví mužsky („Nic jsem nenašel“, „našel, ale…“). U Letsi
  přítomný/budoucí čas („hledám“, „najdu“) nebo neosobně („nic se nenašlo“). Přítomný čas je bez rodu a zní přirozeně.
- Spisovně jako dosud („kontroluji“, ne „kontroluju“) – v aplikaci je to tak všude.

## 1. Nové hodnoty pro `server/brand.js`

| Klíč | Dnes | Návrh | Délka | Proč |
|---|---|---|---|---|
| `name` | `ATLAS` | `Letsi` | 5 zn. | Pod ikonou na Androidu se vejde celé (~12 zn.). |
| `title` | `ATLAS · nejlevnější letenky odkudkoliv kamkoliv` | `Letsi · levné letenky ze všech letišť v okolí` | 45 zn. (≤ 60) | Hlavní výhoda (všechna letiště najednou) hned ve výsledku Googlu; „levné“ místo „nejlevnější“ – neslibuje, co nejde zaručit. |
| `description` | `Nejlevnější letenky ze všech letišť v okolí najednou – Ryanair, Wizz Air i další aerolinky – a plánovač celé cesty. Zdarma, bez registrace.` | `Letsi najde levné letenky ze všech letišť v okolí najednou – Ryanair, Wizz Air i další – a poskládá k nim celou cestu. Zdarma, bez registrace.` | 142 zn. (≤ 155) | Název ve větě (ve vyhledávači i v náhledu odkazu je jasné, kdo „najde“), konkrétní aerolinky zůstávají jako důkaz, „poskládá celou cestu“ místo suchého „plánovač“. |
| `appDescription` | `Nejlevnější lety ze všech letišť v okolí najednou, celá cesta krok za krokem a plánovač cest. Uložené cesty a plány uvidíš i bez internetu.` | `Levné lety ze všech letišť v okolí najednou a k nim celá cesta – ubytování, doprava i program. Uložené cesty máš i bez internetu.` | 128 zn. | Okno instalace: co dostanu (let + celá cesta) a proč ji mít na ploše (offline). Odstraněno zdvojení „celá cesta… a plánovač cest“. |
| `tagline` | `Nejlevnější letenky odkudkoliv kamkoliv` | `Leť si levně. Odkudkoliv kamkoliv.` | 34 zn. | Slogan nese hříčku názvu („Leť si“), „odkudkoliv kamkoliv“ zůstává jako známý motiv. |
| `points[0]` | `Všechna letiště v okolí najednou` | `Všechna letiště v okolí najednou` | 32 zn. | Nejsilnější rozlišení – ponechat. |
| `points[1]` | `Celá cesta krok za krokem` | `Let, ubytování i program v jednom` | 33 zn. | Konkrétně, co „celá cesta“ znamená. |
| `points[2]` | `Zdarma, bez registrace` | `Zdarma, bez účtu, bez reklam v pořadí` | 37 zn. | Důvěra v penězích: nikdo si nekupuje lepší pozici (about.js to slibuje). Jestli se na obrázek nevejde, ponechat „Zdarma, bez registrace“. |
| `image.alt` | `ATLAS – nejlevnější letenky ze všech letišť v okolí najednou a plánovač celé cesty` | `Letsi – levné letenky ze všech letišť v okolí a plán celé cesty` | – | Popis obrázku pro čtečky, sladěný s titulkem. |
| `url` | `https://atlas-letenky.onrender.com` | beze změny, dokud nebude nová doména (PUBLIC_URL na Renderu) | – | Změna adresy rozbije sdílené odkazy a uloženou aplikaci na ploše – samostatný krok. |

Po změně `brand.js` znovu spustit `scripts/build-og-image.mjs` (test/seo.test.js pozná zastaralý obrázek).

## 2. 60 nejdůležitějších textů

„Ponechat“ = text už hlasu Letsi odpovídá; v tabulce je, aby bylo vidět, že se na něj myslelo.
`{…}` = hodnota doplněná v kódu.

### Úvod a první spuštění

| # | Soubor:řádek | Dnešní text | Návrh v hlasu Letsi | Proč |
|---|---|---|---|---|
| 1 | public/index.html:155 | letenky odkudkoliv kamkoliv | Leť si. Odkudkoliv kamkoliv. | Podtitul u loga = slogan s hříčkou názvu. |
| 2 | public/index.html:198 | Kam poletíme? | Ponechat | Kamarádské „my“, krátké, sedí přesně. |
| 3 | public/index.html:199 | Prohledám všechna letiště ve tvém okolí najednou – Ryanair, Wizz Air i další aerolinky – a spočítám i cestu na letiště. K letu ti pak poskládám celou dovolenou: ubytování, program i cenu celkem. | Prohledám všechna letiště v okolí najednou – Ryanair, Wizz Air i další – a spočítám i cestu na letiště. K letu ti pak poskládám celou dovolenou: ubytování, program i cenu celkem. | O ~15 znaků kratší (na telefonu o řádek méně), význam stejný. |
| 4 | public/index.html:208 | 🧳 Naplánovat celou dovolenou → | 🧳 Naplánuj si celou dovolenou → | Tykání v rozkazu a „si“ jako ozvěna „Leť si“. |
| 5 | public/js/app.js:1020 | 👋 Vítej! Najdu levné letenky a poskládám z nich celou cestu. | 👋 Ahoj, tady Letsi. Najdu ti levné letenky a poskládám k nim celou cestu. | Představení značky při prvním spuštění; „k nim“ – cesta není „z letenek“. |
| 6 | public/js/app.js:1024 | Vyber let – nejlevnější letenky nahoře, doprava na letiště zvlášť pod cenou | Vyber let – nejlevnější nahoře, cestu na letiště vidíš hned pod cenou | Kratší; řekne, kde to najdu, ne jak je to technicky. |
| 7 | public/js/app.js:1027 | Začít hledat / Rozumím | Jdeme na to / Rozumím | Hlavní tlačítko vlídněji; „Rozumím“ zůstává (jasné zavření). |

### Hledání

| # | Soubor:řádek | Dnešní text | Návrh v hlasu Letsi | Proč |
|---|---|---|---|---|
| 8 | public/js/app.js:88 | Nejlevnější letenky ze všech letišť v okolí | Levné letenky ze všech letišť v okolí | Podtitul sekce Lety; neslibovat „nejlevnější“, když zdroj může chybět. |
| 9 | public/index.html:245 | Najdi nejlevnější letenky / Ze všech letišť v okolí najednou – i s odhadem cesty na letiště | Najdi si levnou letenku / Všechna letiště v okolí najednou – i s cestou na letiště | „Najdi si“ = hlas značky; podnadpis o slovo kratší (stejně jde o odhad – ten je u nabídky). |
| 10 | public/index.html:401 | 🔎 Najít nejlevnější lety | 🔎 Najít lety | Stejné jako tlačítko v úvodu (index.html:204), na telefonu na jeden řádek; řazení od nejlevnějšího zůstává. |
| 11 | public/index.html:402 (title) | Uložit hledání – cenu pak kontroluji sám, dokud máš ATLAS otevřený v prohlížeči | Uložím hledání a cenu pohlídám – jen dokud máš aplikaci otevřenou | Bez rodu („sám“, „otevřený“), poctivě řečené omezení. |
| 12 | public/js/flights.js:1470 | Hledám nejlevnější lety… | Hledám lety ze všech letišť v okolí… | Čtečka obrazovky: co se právě děje, bez slibu. |
| 13 | public/js/flights.js:1431 a 5023 | Zadej, odkud chceš letět / Odkud letíš? Vyplň pole Odkud | Odkud letíš? Vyplň pole Odkud. (obojí) | Jedna formulace pro stejnou situaci; otázka zní vlídněji než příkaz. |

### Výsledky a nejlevnější let

| # | Soubor:řádek | Dnešní text | Návrh v hlasu Letsi | Proč |
|---|---|---|---|---|
| 14 | public/js/flights.js:2664 | Nejlevnější tam i zpět / Nejlevnější let | Ponechat | Tady je to fakt v rámci výsledků hledání, ne slib. |
| 15 | public/js/flights.js:3864 | 💚 Dobrá cena / Běžná cena / 🔺 Dráž než obvykle | Ponechat | Klidné a poctivé – přesně hlas Letsi (říká i „dráž“). |
| 16 | public/js/flights.js:3876, 3879 | 🔥 Super cena | 💚 Výborná cena | Oheň a „super“ křičí slevu; „Výborná“ je stupeň nad „Dobrá cena“ ve stejné rodině. Třída `hot` v CSS může zůstat. |
| 17 | public/js/flights.js:3967 | Co ATLAS na této trase viděl (v tomto prohlížeči) | Dřívější ceny na téhle trase (v tomhle prohlížeči) | Bez názvu i bez rodu („viděl“); kratší nadpis. |
| 18 | public/js/flights.js:3939 | Na trase {trasa} zatím ATLAS žádné ceny nemá. Ukládá si nejlevnější letenky z každého hledání a příště porovná. | Na trase {trasa} zatím žádné ceny nemám. Z každého hledání si nejlevnější letenku zapamatuji a příště porovnám. | První osoba jako zbytek aplikace. |
| 19 | public/js/flights.js:3972 | Je to odhad, ne předpověď. ATLAS porovnává cenu letenek na osobu … Jak se cena dál vyvine, dopředu nikdo neví. | Je to odhad, ne předpověď. Porovnávám cenu letenky na osobu … Jak se cena vyvine dál, dopředu neví nikdo. | Poctivost zůstává, mluví „já“. |
| 20 | public/js/flights.js:2164 (a 2732) | 💱 Kurzy měn se nepodařilo načíst – přepočet do Kč je orientační. | 💱 Kurzy měn se teď nenačetly – částky v Kč ber jako orientační. | Řekne, co to znamená pro mě (jak číst cenu). |
| 21 | public/js/flights.js:2158 | … při nákupu přes ně může ATLAS dostat provizi, cenu to pro tebe nemění. | … při nákupu přes ně může Letsi dostat provizi. Tvoje cena je stejná. | Důvěra v penězích: krátká samostatná věta, kterou nejde přehlédnout. |
| 22 | public/js/flights.js:2734 | … ATLAS proto páruje lety s rezervou: na stejném letišti aspoň 3 h … | … Proto lety páruji s rezervou: na stejném letišti aspoň 3 h … | První osoba; jinak beze změny (pravidla jsou důležitá). |
| 23 | public/js/flights.js:3412 | … skutečná nejnižší cena může být nižší. Po výpadku je ATLAS na pár minut vynechává. | … skutečná nejnižší cena může být ještě nižší. Po výpadku je na pár minut vynechávám. | Poctivé upozornění zůstává, mluví „já“. |

### Prázdné stavy

| # | Soubor:řádek | Dnešní text | Návrh v hlasu Letsi | Proč |
|---|---|---|---|---|
| 24 | public/js/flights.js:2236 | Nic jsem nenašel / Filtrům nic neodpovídá | Žádný let se nenašel / Filtrům nic neodpovídá | Bez mužského rodu. |
| 25 | public/js/flights.js:2235 | Z letiště {X} jsem pro zadané termíny nenašel žádný let do cíle {Y}. | Z letiště {X} se v zadaných termínech do {Y} žádný let nenašel. | Bez rodu; „nenašel se“ neslibuje, že tam nic nelétá (zdroj mohl chybět). |
| 26 | public/js/flights.js:2230 | Z {X} jsem lety do cíle {Y} našel, ale filtr „do 5 000 Kč“ skryl 3 nabídky. | Lety z {X} do {Y} jsou, jen je filtr „do 5 000 Kč“ skryl (3 nabídky). | Bez rodu, hned řekne podstatné: lety existují. |
| 27 | public/js/searchhelp.js:1218–1220 | Na příštích 6 týdnů jsem z okolí nic nenašel. Zkus větší okruh. (a varianty pro víkendy a svátky) | Na příštích 6 týdnů se z okolí nic nenašlo. Zkus větší okruh. | Bez rodu; stejně u víkendů a svátků. |
| 28 | public/js/flights.js:5334 (a 5293) | Zatím žádné – přidáš je přes ⋯ u karty radaru nebo u cíle v Kamkoliv (⭐ Chci tam). | Zatím žádné. Klepni na ⋯ u karty radaru nebo v Kamkoliv → ⭐ Chci tam. | Kratší, krok za krokem. |
| 29 | public/js/flights.js:4534 | Ulož hledání tlačítkem ♡ | Ulož hledání ♡ a cenu ti pohlídám | Prázdný stav řekne, co z toho budu mít. |

### Chyby a výpadky

| # | Soubor:řádek | Dnešní text | Návrh v hlasu Letsi | Proč |
|---|---|---|---|---|
| 30 | public/js/pwa.js:6 | Server ATLAS je teď nedostupný – zkontroluj připojení k internetu a zkus to znovu. | Server Letsi teď neodpovídá – zkontroluj internet a zkus to znovu. | Kratší (toast na telefonu), stejný význam. |
| 31 | public/js/pwa.js:12 | Server ATLAS přes 2 minuty neodpovídá – spojení je nejspíš moc slabé. Zkus to znovu. | Server Letsi přes 2 minuty mlčí – spojení je nejspíš slabé. Zkus to znovu. | Lidštější sloveso, kratší. |
| 32 | server/index.js:238 | ATLAS teď hledá pro hodně lidí najednou – zkus to prosím za minutu. | Teď hledám pro hodně lidí najednou – zkus to prosím za minutu. | Aplikace mluví „já“; hláška jde ze serveru do UI (pozor na docs/skalovani.md:413 a testy). |
| 33 | public/js/flights.js:5750 | Čekám na server ATLASu… Na bezplatném hostingu usíná, probudí se do půl minuty. Uložené cesty fungují hned. | Probouzím server… Běží zdarma, a tak si občas zdřímne – do půl minuty je tu. Uložené cesty fungují hned. | Poctivě vysvětlené čekání s úsměvem, bez technického „hostingu“. |
| 34 | public/js/flights.js:5783 a 5793 | Server ATLAS neodpovídá – vyhledávání letů nepůjde / Server ATLAS zase odpovídá | Server Letsi neodpovídá – lety teď nevyhledám / Server je zpátky – můžeš hledat | Řekne, co to znamená pro mě; druhá hláška nabídne další krok. |
| 35 | server/index.js:558 | API ATLASu jde používat jen z aplikace ATLAS. | API Letsi jde používat jen z aplikace Letsi. | Jen náhrada názvu (vidí ho hlavně cizí weby, ne uživatel). |

### Hlídání ceny

| # | Soubor:řádek | Dnešní text | Návrh v hlasu Letsi | Proč |
|---|---|---|---|---|
| 36 | public/js/flights.js:4198 | Hledání uloženo – cenu hlídám na Přehledu, dokud máš ATLAS otevřený | Uloženo – cenu hlídám na Přehledu, dokud máš aplikaci otevřenou | Bez rodu, kratší toast; omezení zůstává řečené. |
| 37 | public/js/flights.js:4198 (roll) | Hlídám na Přehledu, dokud máš ATLAS otevřený – termín se posouvá s časem ({…}) | Hlídám na Přehledu, dokud máš aplikaci otevřenou – termín se posouvá s časem ({…}) | Stejná náhrada jako č. 36. |
| 38 | public/js/flights.js:4283 | 🔄 Kontroluji samo zhruba každých 6 h, dokud máš ATLAS otevřený. | 🔄 Kontroluji zhruba každých 6 h – jen dokud máš aplikaci otevřenou. | „Kontroluji samo“ gramaticky nesedí; „jen“ zdůrazní omezení (žádná upozornění na pozadí). |
| 39 | public/js/flights.js:4505 | ATLAS: {cena} – pod tvou cenou / ATLAS: cena klesla na {cena} | Letsi: {cena} – pod tvou cílovou cenou / Letsi: zlevnilo na {cena} | Upozornění v prohlížeči: název na začátku, věcně, bez vykřičníku. |
| 40 | public/js/flights.js:4573 | 📉 Zlevnilo o {x} % / 🎯 Pod tvou cenou | Ponechat | Věcné, krátké, bez křiku. |
| 41 | public/js/alerts.js:234 | Otevři ATLAS – cenu zkontroluji znovu. | Otevři Letsi a cenu zkontroluji znovu. | Text události v kalendáři. |
| 42 | public/js/alerts.js:580 | ATLAS hlídá tvou cenu {cena} | Hlídám ti cenu {cena} | Kamarádské „ti“, první osoba. |
| 43 | public/js/pricecheck.js:283 | … a ATLAS se ozve, jestli zlevní (kontroluje, jen dokud máš stránku otevřenou). Zaručené to není – ceny můžou i stoupnout. | … a ozvu se, když zlevní (jen dokud máš stránku otevřenou). Slíbit to nemůžu – ceny můžou i stoupnout. | První osoba; poctivé „slíbit to nemůžu“ místo neosobního „zaručené to není“. |

### Plán cesty

| # | Soubor:řádek | Dnešní text | Návrh v hlasu Letsi | Proč |
|---|---|---|---|---|
| 44 | public/js/app.js:89 | Moje cesty a průvodce: let, ubytování, auto, program | Let, ubytování, auto a program krok za krokem | Podtitul sekce Cesty – kratší, bez dvojtečky. |
| 45 | public/js/trip.js:919 | Kam chceš jet? | Ponechat | Krátké a vlídné. |
| 46 | public/js/trip.js:3741 | ATLAS je zdarma. Jestli ti pomohl naplánovat cestu, můžeš přispět částkou podle sebe: 💛 Podpořit ATLAS ↗ | Letsi je zdarma. Jestli ti to s cestou pomohlo, můžeš přispět, kolik chceš: 💛 Podpořit Letsi ↗ | Bez rodu („pomohl“); jasné, že zdarma je aplikace, ne příspěvek (viz komentář trip.js:3740). |
| 47 | public/js/trip.js:2329 | Odkazy označené „reklama“ jsou partnerské (affiliate): při rezervaci přes ně může ATLAS dostat provizi. Cenu pro tebe to nezvyšuje a pořadí nabídek to neovlivňuje. | Odkazy označené „reklama“ jsou partnerské: při rezervaci přes ně může Letsi dostat provizi. Tvoje cena je stejná a pořadí nabídek to nemění. | Stejná formulace jako č. 21 – důvěra stojí na tom, že to zní všude stejně. |
| 48 | public/js/places.js:1171 | Objev, co stojí za vidění / Památky, muzea, vyhlídky a výlety kdekoliv na světě – a z nich program na pár dní | Objev, co stojí za vidění / Památky, vyhlídky i výlety kdekoliv na světě – a z nich program na pár dní | Nadpis už sedí („let's see“); podtitul o slovo kratší. |

### Sdílení

| # | Soubor:řádek | Dnešní text | Návrh v hlasu Letsi | Proč |
|---|---|---|---|---|
| 49 | public/js/trip.js:4143 | 🧳 {cesta} {termín} – let, ubytování a program v ATLASu: | 🧳 {cesta} {termín} – let, ubytování a program v Letsi: | Zpráva kamarádovi (WhatsApp) – nesklonný název. |
| 50 | public/js/app.js:2387 | 🧳 {plán} – plán cesty v ATLASu: | 🧳 {plán} – plán cesty v Letsi: | Totéž pro plán. |
| 51 | public/js/sharecard.js:491 | ATLAS – levné letenky a plánování cest. Zdarma, bez registrace. Odkaz nese jen cíl a termín. | Letsi – leť si levně a naplánuj celou cestu. Zdarma, bez registrace. Odkaz nese jen cíl a termín. | Patička karty „Jede někdo se mnou?“ = jediná reklama značky na sítích; slogan místo popisu. |
| 52 | server/lib/shortlinks.js:95 a 101 | Let, ubytování a program po dnech – otevři cestu v ATLASu a ulož si ji. / Plán cesty z ATLASu – program po dnech, otevři ho a ulož si ho. | Let, ubytování a program po dnech – otevři cestu v Letsi a ulož si ji. / Plán cesty z Letsi – program po dnech, otevři ho a ulož si ho. | Popis náhledu odkazu ve WhatsAppu. |
| 53 | server/lib/shortlinks.js:179 | … Klepni na termín a najdi si lety ze svého letiště – v ATLASu, zdarma a bez registrace. | … Klepni na termín a najdi si lety ze svého letiště – v Letsi, zdarma a bez registrace. | Pozvánka kamarádovi. |
| 54 | public/js/offershare.js:101 (a pins.js:307) | (ATLAS – cena se mohla změnit, ověř ji před nákupem) | (Letsi – cena se mohla změnit, před nákupem ji ověř) | Důvěra: varování zůstává, končí slovesem. |

### Aplikace na ploše

| # | Soubor:řádek | Dnešní text | Návrh v hlasu Letsi | Proč |
|---|---|---|---|---|
| 55 | public/js/pwa.js:186 (a 234) | 📲 Přidat ATLAS na plochu / 📲 ATLAS na plochu | 📲 Přidat Letsi na plochu / 📲 Letsi na plochu | Nesklonný název, délka stejná. |
| 56 | public/js/pwa.js:214 | ATLAS je na ploše – otevřeš ho jako aplikaci | Hotovo – Letsi najdeš na ploše jako aplikaci | Bez rodu („ho“). |
| 57 | public/js/pwa.js:238 | Potvrď Přidat. ATLAS se pak otevře jako aplikace přes celou obrazovku a uložené cesty a plány uvidíš i bez internetu. | Potvrď Přidat. Letsi se pak otevře přes celou obrazovku a uložené cesty a plány uvidíš i bez internetu. | Kratší o zbytečné „jako aplikace“. |
| 58 | public/js/pwa.js:320 | ✨ Je k dispozici nová verze ATLASu | ✨ Mám pro tebe novou verzi | Kamarádsky a kratší (lišta na telefonu i s tlačítkem Obnovit). |

### O aplikaci

| # | Soubor:řádek | Dnešní text | Návrh v hlasu Letsi | Proč |
|---|---|---|---|---|
| 59 | public/js/about.js:44 | ATLAS najde levné letenky ze všech letišť ve tvém okolí a poskládá z nich celou cestu – … Je zdarma, bez účtu a bez registrace. Letenky ani hotely sám neprodává: rezervuješ vždy přímo u aerolinky nebo partnera. | Letsi najde levné letenky ze všech letišť v okolí a poskládá k nim celou cestu – … Je zdarma, bez účtu a bez registrace. Letenky ani hotely neprodává: rezervuješ vždy přímo u aerolinky nebo partnera. | Bez rodu („sám“); „k nim“ jako v úvodu. Nadpis about.js:43 „ℹ️ O aplikaci a soukromí“ ponechat. |
| 60 | public/js/about.js:61–63 | Podpoř ATLAS / ATLAS je zdarma a bez reklam v pořadí výsledků. Jestli ti pomohl, můžeš poslat dobrovolný příspěvek – … / 💛 Podpořit ATLAS ↗ | Podpoř Letsi / Letsi je zdarma a nikdo si v něm nekupuje lepší pořadí. Jestli ti to pomohlo, můžeš poslat dobrovolný příspěvek – … / 💛 Podpořit Letsi ↗ | Bez rodu; „nikdo si nekupuje pořadí“ je srozumitelnější než „bez reklam v pořadí výsledků“. Na about.js:54 a 58 jen náhrada názvu. |

Název a popis pro vyhledávače a náhled odkazu jsou v kapitole 1 (`server/brand.js`); u krátkých odkazů navíc
server/lib/shortlinks.js:195 (`{titulek} · ATLAS` → `{titulek} · Letsi`) a :199 (`og:site_name` → `Letsi`).

## 3. Všechna místa s „ATLAS“ (grep)

`grep -rn ATLAS` (bez `node_modules`, žádné nejsou) najde **387 výskytů v 118 souborech**. Malým písmem (`atlas`) jsou
navíc technické identifikátory – viz 3.4.

### 3.1 Uživatel to vidí – nahradit „Letsi“

| Soubor:řádek | Dnes | Návrh |
|---|---|---|
| server/brand.js:8, 10, 22 | `name`, `title`, `image.alt` | viz kapitola 1 |
| public/index.html:144 | `<b>ATLAS</b>` (úvodní animace) | `<b>Letsi</b>` |
| public/index.html:154 | `brand-name` ATLAS | Letsi |
| public/index.html:170 | DEMO pruh „server běží s ATLAS_MOCK=1“ | ponechat (název proměnné, jen demo) |
| public/index.html:402, 424, 426, 427, 428 | „dokud máš ATLAS otevřený“, „je ATLAS přidává sám“, „ATLAS cenu kontroluje“, „které ATLAS nenajde“, „ATLAS je ukáže“ | „dokud máš aplikaci otevřenou“ (č. 11), „u dálkových cílů je přidávám automaticky“, „cenu kontroluji, dokud máš stránku otevřenou“, „které nenajdu“, „ukážu je u výsledků“ |
| public/js/app.js:883, 889, 892, 899, 900, 904, 905, 914, 915, 926 | novinky WHATS_NEW („nastaví ATLAS sám“, „ATLAS najde…“) | v první osobě („nastavím sám“ → „nastavím“), u starých novinek stačí náhrada názvu; WN_ID kvůli přejmenování nezvyšovat |
| public/js/app.js:1564 | „teplotu moře ATLAS nezná“ | „teplotu moře neznám“ |
| public/js/app.js:2387 | sdílení plánu | č. 50 |
| public/js/data.js:5 | tipy TIPS (4×: „ATLAS prohledá…“, „ATLAS skládá…“, „ATLAS přidá sám…“, „ATLAS ho kontroluje…“) | první osoba: „prohledám…“, „skládám…“, „přidám…“, „kontroluji ho…“ |
| public/js/flights.js:1824, 2158, 2336, 2347, 2734, 3412, 3427, 3934, 3939, 3946, 3949, 3950, 3954, 3967, 3972, 4198, 4274, 4280, 4283, 4505, 4534, 5258, 5326, 5333, 5693, 5704, 5714, 5715, 5716, 5719, 5737, 5750, 5783, 5793 | 34 textů s ATLAS | první osoba bez rodu („smím“, „trasu jsem prohledal před…“ → „trasa prohledaná před…“, „podle mých dat“, „ATLAS sem zatím žádnou cenu neviděl“ → „zatím tu žádná cena není“), jinak „Letsi“ (upozornění 4280, nastavení zdrojů 5693–5719); viz č. 16–23, 36–39 |
| public/js/trip.js:1386, 2329, 3741, 4143 | jízdenky, reklama, příspěvek, sdílení | „Jízdenky neprodávám“, č. 47, 46, 49 |
| public/js/about.js:29, 44, 54, 58, 61, 62, 63 | předmět e-mailu, O aplikaci | „Letsi – zpětná vazba (…)“, č. 59–60 |
| public/js/pwa.js:6, 12, 186, 214, 234, 238, 320 | chyby, instalace | č. 30, 31, 55–58 |
| public/js/alerts.js:234, 570, 580 | kalendář, tip, cíl | č. 41, „u nejnižší ceny, jakou jsem viděl“ → „u nejnižší ceny, jaká tu zatím byla“, č. 42 |
| public/js/pricecheck.js:283 | rada k hlídání | č. 43 |
| public/js/recs.js:197 | „teplotu moře ATLAS nezná“ | „teplotu moře neznám“ |
| public/js/transfer.js:50, 101, 120, 129, 137, 146 | přenos do jiného zařízení | „Odkaz je z novější verze Letsi…“, „Tohle není odkaz na přenos z Letsi“, „otevři tam Letsi“, „Letsi se tam otevře“, „Letsi – moje data“ / „📲 Moje data z Letsi…“ |
| public/js/backup.js:236, 237, 238, 501, 676, 710 | záloha | „Tohle není záloha Letsi“, „Letsi – záloha“, „otevři Letsi“ (kontrolu `raw.app !== 'atlas'` neměnit – 3.4) |
| public/js/sharecard.js:294, 341, 491 | značka na kartě pro sítě, patička | `'Letsi'`, č. 51 (karty se kreslí v canvasu – ověřit šířku) |
| public/js/pins.js:307, public/js/offershare.js:101 | text při kopírování nabídek | č. 54 |
| public/js/places.js:2163 | `creator="ATLAS"` v GPX | `creator="Letsi"` |
| public/js/ics.js:129 | `PRODID:-//ATLAS//Cestovni planovac//CS` | `PRODID:-//Letsi//Cestovni planovac//CS` (UID událostí neměnit, ať se v kalendáři neduplikují) |
| public/data/pretrip.json:3, data/entry.json:5 | „ATLAS za správnost neručí.“ | „Letsi za správnost neručí.“ |
| server/index.js:238, 558, 1194, 1195 | přetížení, cizí web, výpis v konzoli | č. 32, 35, „Letsi běží na …“; 1195 ponechat (ATLAS_MOCK) |
| server/lib/shortlinks.js:95, 101, 158, 179, 188, 195, 199 | náhledy krátkých odkazů | č. 52–53, „Cesta z Letsi“, „Otevírám cestu v Letsi…“, „Otevírám pozvánku v Letsi…“, `· Letsi`, `og:site_name` Letsi |
| server/lib/ground.js:438 | FlixBus: „jen odkaz – ceny ATLAS nenačítá“ | „jen odkaz – ceny nenačítám“ (pravidlo FlixBus zůstává) |
| server/providers/index.js:50 | stav LiteAPI: „ATLAS je neukazuje“ | „Letsi je neukazuje“ |
| package.json:5 | `description` | „Letsi – levné letenky ze všech letišť v okolí najednou (Ryanair, Wizz Air, Travelpayouts) + plánovač cesty“ |

### 3.2 Komentáře v kódu – nahradit při přejmenování jedním průchodem (uživatel je nevidí)

Hlavičky modulů `/* ATLAS – … */` a zmínky v komentářích: public/css/flights.css:1, pretrip.css:1, trip.css:1, 98,
pwa.css:6; public/js/transfer.js:1, pins.js:1, qr.js:1, places.js:1, about.js:1, 6, 12, 37, ics.js:1, recs.js:1, 19,
sharelink.js:1, weather.js:1, data.js:1, sharecard.js:1, 2, 135, 180, pwa.js:1, 15, 80, 148, 173, 184, 337 (console),
searchhelp.js:1, 2099, 2136, rank.js:1, pretrip.js:1, since.js:1, alerts.js:1, 463, planshare.js:1, offershare.js:1, 20,
backup.js:1, entry.js:1, smart.js:1, flights.js:1, 2093, 4373, 4519, 5234, 5315, errlog.js:1, 12, trip.js:1, 287, 3740,
pricecheck.js:1, 313, app.js:1, 168, 408, 2791, lazy.js:1, ground.js:1, public/sw.js:1, public/index.html:14, 207;
server/index.js:2, 201, 555, 572, server/config.js:20, 126, server/lib/security.js:8, 11, seo.js:5, places.js:71,
fuel.js:6, clienterr.js:9, poi.js:548, partnerids.js:6, shortlinks.js:6, 163, stayplan.js:1, search.js:97, 113, 233,
1114, ground.js:534, server/providers/wizzair.js:248, ryanair.js:95, kiwi.js:403, mock.js:1, stays/demo.js:1;
scripts/build-icons.mjs:3, build-ground.mjs:6, 7. Návrh: „ATLAS“ → „Letsi“, význam beze změny.

### 3.3 Dokumentace a pravidla

README.md (69×, včetně nadpisu a kapitoly „Přejmenování a doména“), CLAUDE.md:1, 3, docs/skalovani.md:1, 413,
docs/placene-planovani.md:4, 7, 31, 42, render.yaml:22. Návrh: nahradit „Letsi“ ve stejném PR jako aplikaci;
legacy/ATLAS-puvodni.html (2×) **ponechat** – archiv původní verze.

### 3.4 Technické názvy – neměnit (nebo jen s převodem)

- **`ATLAS_MOCK`** (.env.example:65, server/config.js:41–42, index.html:170, server/index.js:1195, scripts/load-test.mjs:41,
  komentáře v providers a lib): proměnná prostředí na Renderu a v testech. Přejmenovat jen s přechodem (číst obojí),
  jinak ponechat – uživatel ji nevidí.
- **Klíče localStorage** (`atlas_v…` v index.html:66, `atlas_explore_v…`, `atlas_pretrip_v…`, `atlas_since…`) a značka
  zálohy `raw.app !== 'atlas'` (backup.js:237): **neměnit** – změna by uživatelům „smazala“ cesty, hlídání a zálohy.
- **Service worker a verze** (`atlas-build`, `atlas-served`, `atlas-fresh`, `atlas-seen`, cache `atlas-…` v sw.js,
  pwa.js, server/lib/pwa.js): neměnit – jen interní hlavičky a názvy mezipaměti.
- **Značka upozornění** `atlas-watch-{id}` (flights.js:4505), vrstvy mapy `atlas-lines`/`atlas-route` (places.js),
  UID v ics.js:126, 160: neměnit (interní, změna UID by zdvojila události v kalendáři).
- **Názvy stahovaných souborů** (`atlas-tura-….gpx` places.js:2403, `atlas-….png/ics` places.js:2876, sharecard.js:359,
  `atlas-pretrip-…` pretrip.js:684): uživatel je vidí ve Stažených – lze změnit na `letsi-…` bez rizika.
- **User-Agent** pro cizí služby (`ATLAS-travel/2.0 …` v server/lib/poi.js:12, brouter.js:7, fuel.js:13, providers/kiwi.js:183,
  scripts/build-regions.mjs:25, build-ground.mjs:33): změnit na `Letsi/…` až s novou doménou (kontakt v UA má sedět).
- **Testy** (test/*.test.js, ~120 výskytů – např. about.test.js 8×, pwa.test.js 5×, dark-visual.test.js 6×, backup.test.js 5×):
  kontrolují texty s „ATLAS“; upravit spolu s texty, `npm test` musí projít.

## 4. Postup přejmenování (návrh)

1. `server/brand.js` podle kapitoly 1, znovu vykreslit og-image (`scripts/build-og-image.mjs`), ikony beze změny.
2. Texty z kapitoly 2 a 3.1 v jednom PR; testy upravit současně.
3. Komentáře a dokumentace (3.2, 3.3) – samostatný PR bez změny chování.
4. Doména a User-Agent až s novou adresou (PUBLIC_URL na Renderu).
5. Do `WHATS_NEW` jedna věta „ATLAS je teď Letsi – všechno uložené zůstává“ (výjimka z „jen nové funkce“: lidé musí
   poznat, že jde o stejnou aplikaci).
