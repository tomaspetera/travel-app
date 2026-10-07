# Živá kontrola – kolo 9c: animace startu a ikona

- **Web:** https://atlas-letenky.onrender.com (zdroj stránky obsahuje `class="l-jet"`)
- **Kdy:** 7. 10. 2026, skutečný Chrome (playwright-core, `channel: 'chrome'`, dočasný profil, cs-CZ)
- **Jak:** okno aplikace Chromu (`chrome --app=…`, okno 1100×800), stránka se hlásí jako `display-mode: standalone`. 14 startů v okně aplikace + 1 v běžné kartě. Nic jsem neinstaloval, kód aplikace nebyl měněn.
- Skripty, JSON a všechny snímky jsou na PC v `%TEMP%\atlas-qa\live9\` (`launch3.js`, `launchc.json`), výběr snímků ve složce `live-check-r9c/`.

## Shrnutí

Animace běží podle popisu, plynule a ve všech startech skoro na milisekundu stejně. Po zmizení úvodní obrazovky se obsah neposune. Manifest i ikony odpovídají zadání.

Našel jsem **1 vizuální vadu** (N1: vlaštovka/letadlo na širokém okně neodletí z obrazovky, zastaví se vpravo nahoře) a 2 drobnosti (N2, N3).

## Tabulka bodů

| # | Bod | Výsledek | Poznámka |
|---|-----|----------|----------|
| 1a | Nejdřív ikona a dole „ATLAS“ | ✅ | Zaoblený čtverec s přechodem a vlaštovkou kousek nad středem, „ATLAS“ dole. Viditelné od ~0,09 s. |
| 1b | Vlaštovka vylétne šikmo vpravo nahoru a promění se v letadlo | ✅ | Pohyb začíná v ~0,31–0,38 s, proměna ve bílé letadlo je hotová v ~0,61–0,66 s. |
| 1c | Čtverec se zmenší a rozplyne | ✅ | Pryč v ~0,87–0,93 s. |
| 1d | Obrazovka se rozplyne do hotového přehledu | ✅ | Začne mizet v **0,97 s**, pryč v **1,29 s**. |
| 1e | Čeká-li se na přehled, letadlo přelétá zleva doprava | ✅ | Viděno při zdrženém API: druhé letadlo letí zleva doprava od ~1,0 s. Vada N1. |
| 1f | Plynulost, žádné škubání, blikání, poskočení obsahu | ✅ | Mezery mezi snímky nad 50 ms jen do 0,2 s od začátku (načítání skriptů), během letu a prolnutí žádné. Posun rozvržení po zmizení = 0. |
| 1g | Světlý i tmavý režim | ✅ | Stejné časy; ve světlém režimu se tmavá obrazovka prolne do světlého přehledu bez probliknutí. |
| 1h | Omezené animace (prefers-reduced-motion) | ✅ | Jen statická ikona s vlaštovkou a „ATLAS“, žádný let ani druhé letadlo. Mizí v 0,25–0,30 s, pryč v 0,56–0,58 s. |
| 1i | Běžná karta prohlížeče | ✅ | Úvodní obrazovka se nezobrazí. |
| 2a | Manifest: name „ATLAS“ | ✅ | `name` i `short_name` = „ATLAS“, `display: standalone`, pozadí i barva motivu `#080c1a`. |
| 2b | Maskovatelná ikona | ✅ | Uvnitř bezpečné zóny (kruh 80 %) je jen barevný přechod s vlaštovkou. Tmavý okraj je široký 15 px z 512 a leží celý mimo ni. |
| 2c | Ikona 512 „any“ | ✅ | Rohy jsou průhledné (alfa 0), tvar zaoblený čtverec. Stejně ikona 192. |
| 3 | Pruh „Čekám na server ATLASu…“ | – | Samovolně se neobjevil. Viděl jsem ho jen v jednom startu, kde jsem záměrně nechal API bez odpovědi kvůli bodu 1e – viz N3. |

## Naměřené časy

Čas v ms od začátku načítání stránky.

| Start | Viditelná | Začátek letu | Letadlo | Čtverec pryč | Začne mizet | Pryč | Posun po zmizení |
|---|---|---|---|---|---|---|---|
| tmavý 1 (prázdná cache) | 77 | 322 | 581 | 847 | 975 | 1 291 | 0 |
| tmavý 2 | 96 | 317 | 620 | 886 | 977 | 1 292 | 0 |
| tmavý 3 | 101 | 337 | 639 | 906 | 972 | 1 287 | 0 |
| tmavý 4 | 117 | 375 | 661 | 928 | 976 | 1 291 | 0 |
| tmavý 5 | 113 | 335 | 635 | 902 | 968 | 1 283 | 0 |
| tmavý 6 | 87 | 305 | 607 | 874 | 971 | 1 286 | 0 |
| tmavý 7 | 89 | 331 | 631 | 898 | 977 | 1 292 | 0 |
| světlý 1 | 95 | 337 | 632 | 898 | 977 | 1 292 | 0 |
| světlý 2 | 84 | 318 | 618 | 884 | 975 | 1 290 | 0 |
| světlý 3 | 101 | 341 | 620 | 887 | 972 | 1 287 | 0 |
| světlý 4 | 77 | 310 | 612 | 879 | 976 | 1 291 | 0 |
| světlý, omezené animace | 84 | – | – | – | 303 | 581 | 0 |
| tmavý, omezené animace | 86 | – | – | – | 246 | 560 | 0 |
| tmavý, API bez odpovědi | 107 | 305 | 608 | 874 | 1 670 | 1 983 | 0,036 |

Přehled byl ve všech běžných startech vykreslený už v 0,21–0,32 s, takže obrazovka čeká jen na dokončení vzletu.
Proti minulému kolu (pryč v ~0,8 s) je start o necelou půlsekundu delší, což odpovídá délce animace.
Omezené animace jsem zapnul emulací v prohlížeči, ne přepnutím ve Windows.

## Nálezy

### N1 – Na širokém okně letadlo neodletí, zastaví se vpravo nahoře (vizuální vada)
- **Postup:** okno aplikace 1100×800, běžný start; výrazněji při pomalém startu.
- **Co se stalo:** let končí posunem o `translate(1150px, -915px)` v jednotkách ikony, což je na obrazovce asi 287 px doprava a 229 px nahoru od středu. V okně 1100 px tak letadlo zůstane stát zhruba ve třech čtvrtinách šířky u horního okraje. Při běžném startu tam „zamrzne“ a prolne se pryč (snímek `launchc-dark-2-film-08.png`). Když se čeká na přehled, stojí tam nehybně a zleva mezitím letí druhé letadlo – jsou vidět dvě najednou (`launchc-dark-api-hang-film-09.png`, `…-10.png`).
- Na telefonu (šířka ~390 px) by 287 px od středu stačilo, tam letadlo z obrazovky odletí. Na telefonu jsem to neověřoval.
- **Návrh:** cíl letu počítat z velikosti okna (např. `translate(calc(50vw + 80px), calc(-45vh - 80px))` na obalu v pixelech místo jednotek SVG), nebo na konci letu letadlo zprůhlednit (`opacity: 0` v posledních 20 % `l-fly`).

### N2 – První start s prázdnou cache: pár delších snímků na začátku vzletu (drobnost)
- Při úplně prvním startu byly mezi snímky mezery 60–100 ms v čase 0,17–0,45 s (stahování a spouštění skriptů), tedy těsně na začátku letu. Další starty je nemají.

### N3 – Při zdrženém API obsah po zmizení obrazovky ještě jednou poskočí (jen při mém umělém testu)
- **Postup:** všechny požadavky `/api/**` ponechány bez odpovědi (nutné pro bod 1e).
- **Co se stalo:** přehled se vykreslil v 1,62 s, obrazovka začala mizet v 1,67 s a zmizela v 1,98 s – pojistka tedy drží hluboko pod 3,5 s. Objevil se pruh „Čekám na server ATLASu… Na bezplatném hostingu usíná, probudí se do půl minuty. Uložené cesty fungují hned.“ v levém sloupci místo boxu „Zdroje cen“. V 3,1 s, tedy po zmizení úvodní obrazovky, byl zaznamenán malý posun rozvržení (0,036).
- Kdy pruh zmizí, jsem neměřil, protože API v tom testu neodpovědělo vůbec. Samovolně (uspaný server) jsem ho během kontroly neviděl.

## Co je na snímcích

| Snímek | Čas | Co ukazuje |
|---|---|---|
| `launchc-dark-2-film-01.png` | 0,25 s | Ikona s vlaštovkou a „ATLAS“ |
| `launchc-dark-2-film-04.png` | 0,51 s | Vlaštovka se mění v letadlo |
| `launchc-dark-2-film-06.png` | 0,76 s | Letadlo mimo ikonu, čtverec bledne |
| `launchc-dark-2-film-07.png`, `-08`, `-09` | 0,93–1,31 s | Prolnutí do přehledu; na `-08` je vidět stojící letadlo vpravo nahoře (N1) |
| `launchc-light-1-film-06.png`, `-08`, `-10` | 0,77–1,61 s | Totéž ve světlém režimu |
| `launchc-light-reduced-film-01.png`, `-03` | 0,27 a 0,71 s | Omezené animace – statická ikona |
| `launchc-dark-api-hang-film-09.png`, `-10`, `-11` | 1,3–2,4 s | Čekání: dvě letadla najednou (N1), pak přehled s pruhem čekání na server |
| `launchc-icons.png` | – | Ikona 512 na šachovnici (průhledné rohy), maskovatelná s kruhem bezpečné zóny a oříznutá na ni |
| `launchc-tab-dark-00.png` | 0,16 s | Běžná karta – bez úvodní obrazovky |

## Co jsem neověřil

- Skutečnou instalaci, ikonu na ploše a systémovou úvodní obrazovku (zadání: nic neinstalovat).
- Panel DevTools → Application → Manifest jsem neotevíral; manifest a ikony jsem přečetl přímo ze stránky a body ikon změřil po pixelech, což odpovídá tomu, co panel ukazuje.
- Start na telefonu a přepnutí „Animační efekty“ přímo ve Windows.
- Plynulost lidským okem – vycházím z měření snímek po snímku (asi 230 snímků na start) a ze snímků obrazovky.
