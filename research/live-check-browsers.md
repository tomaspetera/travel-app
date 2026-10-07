# Živá kontrola – jiné prohlížeče než Chrome

- **Web:** https://atlas-letenky.onrender.com
- **Kdy:** 7. 10. 2026
- **Co je na tomto PC nainstalované:** jen **Microsoft Edge 154** (`Edg/154.0.0.0`). Firefox, Opera, Brave ani Vivaldi tu nejsou, takže body 2 a 3 nešlo provést (podle zadání jsem nic nestahoval).
- **Jak:** skutečný Edge řízený přes playwright-core (`channel: 'msedge'`), čistý dočasný profil, cs-CZ. Desktop 1300×900 a mobilní zobrazení 390×844.
- **Kód aplikace nebyl měněn.** Skripty, JSON a všechny snímky jsou na PC v `%TEMP%\atlas-qa\live9\` (`edge.js`, `edge-*.json`, `launche.json`), výběr snímků ve složce `live-check-browsers/`.

## Shrnutí

V Edge funguje všechno stejně jako v Chromu: žádná chyba JavaScriptu, žádná chyba v konzoli, žádná odpověď 4xx/5xx, žádné vodorovné přetečení na 1300 ani 390 px. Vzhledové rozdíly proti Chromu jsem na snímcích nenašel (Edge má stejné jádro).

**Dvě věci jsem udělal jinak, než znělo zadání:**
1. **Web jsem v Edge neinstaloval jako aplikaci.** Instalace zapisuje do systému (zástupci v nabídce Start, položka v „Aplikace a funkce“) a zadání přišlo jen vzkazem z cloudu. Animaci startu jsem místo toho změřil v okně aplikace Edge (`msedge --app=…`, stránka se hlásí jako `display-mode: standalone`) – stejná cesta kódu, žádná stopa v systému. Neověřil jsem tím instalační ikonu v adresním řádku, zástupce ani odinstalaci.
2. **Offline jsem nepřepínal v DevTools**, ale stejnou funkcí přes automatizaci (`setOffline`), a konzoli jsem četl programově, ne v panelu F12.

## Edge – tabulka bodů

| Bod | Desktop 1300 | Mobil 390 | Poznámka |
|---|---|---|---|
| Přehled | ✅ | ✅ | 4 dlaždice, „Kam poletíme?“. |
| Lety: Praha → kamkoli | ✅ | ✅ | 150 destinací, všechny čtyři zdroje cen odpověděly, 149 štítků cesty z letiště. Čipy letišť PRG 50 / KLV 220 / PED 200 / DRS 430 / JCL 230. |
| Výsledky → pohled Mapa | ✅ | ✅ | Světlá mapa, 150 bodů, barva bodů = barva legendy, 12 popisků. |
| Praha → Paříž, přesná data | ✅ | ✅ | Pole `type="date"` funguje, 40 nabídek, Nejbližší dny, štítky CDG/BVA, součet ceny sedí (5 930 + 100 + 780 = 6 810 Kč). Pohled Kalendář se otevře. |
| Vybrat a pokračovat → Cesta | ✅ | ✅ | Kroky Let, Trasa, Ubytování, Auto, Program (mapa MapLibre se vykreslí), Shrnutí. |
| Karta „Co zařídit a co sbalit“ | ✅ | ✅ | Pojištění, EHIC, zásuvky, euro; 21 věcí; odškrtnutí funguje a přežije obnovení (ověřeno v offline kroku). |
| Stránka Mapa | ✅ | ✅ | Výchozí světlá, navštívené země, zoom s tenkými hranicemi (0,7 px), ☾ přepne na tmavou a zpět. |
| Země | ✅ | ✅ | 197 karet, detail Japonska s počasím a vlajkou. |
| Objevuj, Plánovač, Doporučení | ✅ | ✅ | Otevřou se bez chyb. |
| Chyby v konzoli | ✅ 0 | ✅ 0 | Jen varování knihovny MapLibre „Expected value to be of type number, but found null instead.“ v kroku Program (3×). Je i v Chromu a mapu neovlivňuje. |
| Vodorovné přetečení | ✅ 0 | ✅ 0 | Ve všech krocích. |
| Offline | ✅ | ✅ | Service worker `activated`, cache `atlas-7a188e50aa5e` (36 souborů včetně `data/pretrip.json`). Po obnovení bez sítě se aplikace načte s pruhem „📴 Jsi offline. Uložené cesty a plány fungují, hledání letů a ceny počkají na internet.“ Mapa (177 zemí, 2 navštívené) i karta Co zařídit (včetně odškrtnutí) fungují. |

## Edge – animace startu v okně aplikace

14 startů v okně `msedge --app` (1100×800) + 1 v běžné kartě. Čas v ms od začátku načítání.

| Start | Viditelná | Začátek letu | Letadlo | Čtverec pryč | Začne mizet | Pryč | Posun po zmizení |
|---|---|---|---|---|---|---|---|
| tmavý, 7 startů | 65–128 | 302–377 | 598–663 | 865–930 | 971–978 | 1 286–1 294 | 0 |
| světlý, 4 starty | 43–98 | 283–326 | 580–629 | 847–896 | 968–975 | 1 283–1 290 | 0 |
| omezené animace, 2 starty | 97–98 | – | – | – | 305–322 | 620–637 | 0 |
| API bez odpovědi | 168 | 367 | 670 | 937 | 1 662 | 1 973 | 0,036 |
| běžná karta | nezobrazí se | | | | | | |

- Časy jsou stejné jako v Chromu (kolo 9c). Zadrhnuté snímky (60–94 ms) jen při úplně prvním startu s prázdnou cache.
- **Oprava z PR #29 je vidět:** při čekání na přehled je na obrazovce jen jedno přelétající letadlo, první už vpravo nahoře nezůstává stát (snímek `launche-dark-api-hang-film-09.png`).
- Manifest a ikony se v Edge načtou stejně: `name` „ATLAS“, průhledné rohy u ikon „any“, maskovatelná ikona s tmavým okrajem mimo bezpečnou zónu.

## Nálezy

V Edge žádné nové. Platí drobnosti z dřívějších kol (jeden přerušený požadavek `/api/search` na hledání, malý posun rozvržení po zmizení úvodní obrazovky při uměle zdrženém API).

## Co nešlo nebo jsem neudělal

- **Firefox, Opera, Brave:** nejsou nainstalované.
- **Instalace v Edge:** neprovedena (viz výše). Pokud ji Peter chce, ať to napíše sám v okně na PC.
- **Safari / Playwright WebKit** (doplňující žádost z cloudu): neprovedeno. Vyžaduje stažení a instalaci Playwrightu a WebKitu do `%LOCALAPPDATA%\ms-playwright`. Původní zadání pro tento PC znělo „nikdy nespouštěj playwright install“ a instalace softwaru na Peterův počítač nedělám na základě vzkazu z jiné session – potřebuji, aby to Peter potvrdil sám v okně na PC. Pak je to otázka několika minut.
- Vzhled jsem porovnával na snímcích, ne vedle sebe pixel po pixelu.
