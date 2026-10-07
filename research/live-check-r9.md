# Živá kontrola – kolo 9: světlá mapa, „Co zařídit a co sbalit“, offline

- **Web:** https://atlas-letenky.onrender.com (commit `c9c0b2b`, tlačítko `#mapStyle` na webu je)
- **Kdy:** 7. 10. 2026, skutečný Chrome (playwright-core, `channel: 'chrome'`, čistý profil, cs-CZ)
- **Běhy:** desktop 1300×900 a mobil 390×844, každý v tmavém i světlém režimu aplikace (Praha → Barcelona), a desktop Praha → Bangkok
- **Kód aplikace nebyl měněn.** Skripty, JSON a všechny snímky jsou na PC v `%TEMP%\atlas-qa\live9\`, výběr snímků je ve složce `live-check-r9/`.

## Shrnutí

Mapa, karta i offline fungují na desktopu i mobilu, v obou režimech aplikace. Žádná chyba JavaScriptu, žádná odpověď 4xx/5xx, žádné vodorovné přetečení.

**Jedna věc nefunguje podle zadání:** sdílený odkaz nepřenese odškrtnuté úkoly – ani odkaz na cestu, ani odkaz na plán z plánovače (N1).
Dále 5 drobností (N2–N6).

## Tabulka bodů

| # | Bod | Výsledek | Poznámka |
|---|-----|----------|----------|
| 1a | Výchozí světlá mapa | ✅ | `data-map="light"` v čistém profilu. Moře `#cfe2f4`, pevnina `rgb(253,252,249)`, hranice `rgb(107,122,156)`. Dobře čitelné v tmavém i světlém režimu aplikace. |
| 1b | Navštívené země | ✅ | 5 zemí (Francie, USA, Brazílie, Austrálie, Česko) – modrofialový přechod je na světlé mapě velmi výrazný. Počítadlo „5 z 197 zemí · 3 %“. |
| 1c | Přiblížení +/−, kolečko, tažení | ✅ | Tloušťka hranic zůstává 0,7 px i při 8× přiblížení (`non-scaling-stroke`), nic se nerozpadá, ⤢ vrátí výchozí pohled. |
| 1d | ☾ → tmavá mapa, volba vydrží obnovení | ✅ | Ikona se změní na ☀ s popiskem „Světlá mapa (čitelná i na slunci)“, po obnovení zůstane tmavá i navštívené země. ☀ vrátí světlou. |
| 2a | Lety „kamkoli“ → pohled Mapa | ✅ | Světlá mapa, 150 bodů, barvy bodů přesně odpovídají legendě. |
| 2b | Popisky (město + cena) čitelné | ⚠️ | Samotné písmo je čitelné (tmavé s bílým obrysem), ale 12 popisků se v Evropě překrývá – N2. |
| 2c | Po ☾ je tmavá i mapa výsledků | ✅ | Podklad `rgb(12,19,41)`, světlejší body, legenda sedí. |
| 3 | Mapa výletu (MapLibre) | ✅ | Světlá mapa → styl `liberty` i v tmavém režimu aplikace; po ☾ → styl `dark` i ve světlém režimu aplikace. |
| 4a | Položky karty dávají smysl | ✅ | Barcelona: pojištění, EHIC, zásuvky pasují, euro. Bangkok: pojištění, DROZD, očkování, adaptér, baht, pas místo OP, bez EHIC. Poznámky N4, N5. |
| 4b | Odškrtnutí vydrží obnovení | ✅ | 2 úkoly + 3 věci, po obnovení stejné, počítadlo „✔ 5/28“. Vydrží i zvolená aktivita (Pláž a moře). |
| 4c | Vlastní položka | ⚠️ | V kartě u cesty přidat nejde (žádné pole). Jde až v plánovači po „Uložit do plánovače“ – tam funguje a vydrží obnovení. N3. |
| 4d | Tisk | ✅ | Vytiskne se jen karta, černé na bílém, bez navigace, 2 strany A4. |
| 4e | Připomínky .ics | ✅ | Barcelona: „🛡️ Sjednat cestovní pojištění (Španělsko)“ 21. 11. Bangkok navíc „📝 Registrace v systému DROZD (Thajsko)“ 9. 11. Soubor je platný. |
| 4f | Sdílený odkaz přenese odškrtnuté úkoly | ❌ | Nepřenese – N1. |
| 5a | Service worker aktivní | ✅ | `sw.js`, stav `activated`, stránku řídí. Manifest: `standalone`, 3 ikony. |
| 5b | Cache obsahuje `data/pretrip.json` | ✅ | Cache `atlas-…` se 34–37 soubory včetně `data/pretrip.json`, `data/entry.json`, `data/countries.json`, `vendor/countries-110m.json`. |
| 5c | Offline: aplikace se načte | ✅ | Po obnovení bez sítě naběhne, nahoře pruh „Jsi offline. Uložené cesty a plány fungují, hledání letů a ceny počkají na internet.“ |
| 5d | Offline: Mapa a karta Co zařídit | ✅ | Mapa 177 zemí včetně 5 navštívených; karta se všemi položkami a odškrtnutím; Země 197 karet. |
| 5e | Offline: hledání letů | ✅ | „Jsi offline – připoj se k internetu a zkus to znovu.“ |
| – | Chyby v konzoli, přetečení | ✅ | Online žádná chyba. Offline jen očekávané `ERR_INTERNET_DISCONNECTED` (4–5×). Přetečení 0 na 1300 i 390 px. |

## Co je na snímcích

| Snímek | Co ukazuje |
|---|---|
| `r9-dark-desktop-1-map-default.png` | Výchozí světlá mapa v tmavém režimu aplikace |
| `r9-dark-desktop-2-map-visited.png` | 5 navštívených zemí |
| `r9-light-desktop-4-map-wheel-drag.png` | 8× přiblížení ve světlém režimu – tenké hranice |
| `r9-dark-desktop-5-map-dark.png` | Tmavá mapa po ☾ |
| `r9-light-mobile-2-map-visited.png` | Mapa na mobilu, světlý režim |
| `r9-dark-desktop-8-resmap-lightmap.png` | Mapa výsledků – překryv popisků v Evropě (N2) |
| `r9-dark-mobile-8-resmap-lightmap.png` | Totéž na mobilu |
| `r9-dark-desktop-7-resmap-darkmap.png` | Mapa výsledků při tmavé mapě |
| `r9-dark-desktop-9-tripmap-lightmap.png`, `…-10-tripmap-darkmap.png` | Mapa výletu světlá / tmavá |
| `r9-dark-desktop-12-pretrip-card.png` | Karta pro Barcelonu |
| `r9-dark-bangkok-desktop-12-pretrip-card.png` | Karta pro Bangkok |
| `r9-dark-desktop-14-print.png` | Tisk |
| `r9-light-desktop-21-planner-shared.png` | Sdílený plán v novém profilu – nic není odškrtnuté (N1, N6) |
| `r9-dark-mobile-16-offline-home.png`, `…-18-offline-pretrip.png` | Offline na mobilu |

## Nálezy

### N1 – Sdílený odkaz nepřenese odškrtnuté úkoly (❌ proti zadání)

**Postup A – odkaz na cestu:**
1. Lety → Praha → Barcelona → hledat → „Vybrat a pokračovat“ → krok Shrnutí.
2. V kartě „Co zařídit a co sbalit“ odškrtnout „Sjednej cestovní pojištění“ a „Vezmi EHIC“ a 3 věci ze seznamu. Počítadlo ukáže „✔ 5/28“.
3. „🔗 Zkopírovat odkaz na cestu“ → odkaz otevřít v novém profilu.

**Co se stalo:** karta se zobrazí, ale nic není odškrtnuté, počítadlo „✔ 0/28“. Zvolené aktivity (Pláž a moře) se přenesly.

**Postup B – odkaz na plán:**
1. Ve Shrnutí „💾 Uložit do plánovače“ → otevřít plán. Odškrtnutí se do seznamu „Sbaleno“ převzalo správně („Zařídit: cestovní pojištění“, „Zařídit: zkontrolovat EHIC“ a 3 věci).
2. Přidat vlastní položku, odškrtnout ji → „🔗 Sdílet“ → odkaz otevřít v novém profilu → „Přidat do plánovače“.

**Co se stalo:** přenese se všech 29 položek včetně vlastní, ale žádná není odškrtnutá.

Stejně na desktopu i mobilu, u Barcelony i Bangkoku.

**Příčina a návrh:**
- Plán: `public/js/planshare.js`, `encode()` posílá `checklist: p.checklist.map(x => x.t)` – jen texty. Návrh: přidat pole indexů hotových položek (např. `cd: [0, 1, 4]`) a v `sanitize()` z něj nastavit `done`.
- Cesta: odškrtnutí karty je jen v `localStorage` pod klíčem cesty a do `#trip=` se nedostane; po importu má cesta nový klíč. Návrh: v `share()` přibalit hotové klíče (`PreTrip.doneOf(PreTrip.tripKey(t))`) a v `importFromHash()` je zapsat přes `PreTrip.setDone` pod nový klíč.

### N2 – Popisky na mapě výsledků se v Evropě překrývají (čitelnost)
- **Postup:** Lety → Praha, bez cíle → hledat → pohled „🗺️ Mapa“.
- **Co se stalo:** 12 nejlevnějších cílů je skoro vždy ve střední Evropě, takže popisky („Gdaňsk 925“, „Londýn 1 308“, „Poprad 1 471“, „Kišiněv 1 406“, „Skopje 1 329“…) leží přes sebe a přes body. Na mobilu (390 px) z nich jde přečíst jen „Poprad“ a „Skopje“. Po přiblížení se rozestoupí.
- **Návrh:** popisek vykreslit jen tehdy, když nekoliduje s už vykresleným (jednoduchý test překryvu obdélníků v pořadí od nejlevnějšího); na úzké mapě nejvýš 4–5 popisků.

### N3 – Vlastní položku nejde přidat přímo v kartě (drobnost)
- Karta u cesty nemá žádné pole pro vlastní položku. Jde to až v plánovači („Sbaleno“ → pole pro novou položku). Pokud to tak má být, stačí do karty dopsat „vlastní položky přidáš po uložení do plánovače“.

### N4 – Rada „bal na vrstvy“ i do tropů (drobnost)
- Bangkok, ~30 °C: „Letíš jen s malým zavazadlem… na 6 nocí bal na vrstvy a počítej s praním.“ Seznam oblečení pod tím je správně lehký. Návrh: „na vrstvy“ psát jen při chladnějším podnebí.

### N5 – Teploty pro Barcelonu vypadají nízké (k ověření)
- Karta uvádí pro prosinec „přes den ~12 °C, v noci ~4 °C“ a podle toho radí přechodovou bundu. Pro pobřežní Barcelonu to vypadá o pár stupňů méně, než bývá zvykem; nejspíš je to tím, že buňka NASA POWER zahrnuje i vnitrozemí. Neověřoval jsem to proti jinému zdroji.

### N6 – Zaškrtávátka v plánovači mají různou velikost (kosmetika)
- V seznamu „Sbaleno“ jsou políčka u dvouřádkových položek viditelně menší než u jednořádkových (snímek `…-21-planner-shared.png`). Návrh: `flex: 0 0 auto` a pevná šířka u `input[type=checkbox]` v `.check`.

### Informace
- **Délka odkazu na cestu:** 82 097 znaků (Barcelona), 104 169 znaků (Bangkok). V Chromu se otevře bez potíží, ale neověřoval jsem, jestli tak dlouhý odkaz projde e-mailem nebo chatovacími aplikacemi. Odkaz na plán má 3 884 znaků.
- **Styl tmavé mapy výletu** se po přepnutí ☾ stáhne dvakrát (dva požadavky na `styles/dark`); na funkci to nemá vliv.
- Během kontroly se na webu změnil název cache (`atlas-15cafff0b757` → `atlas-8cd9c8478830`), tedy proběhlo další nasazení. Výsledky před ním i po něm jsou stejné.

## Co jsem neověřil

- Čitelnost na skutečném slunci – hodnotil jsem jen kontrast na snímcích.
- Cestu autem mimo EU (mezinárodní řidičský průkaz) – zkoušel jsem jen lety do Barcelony a Bangkoku, kde se položka o řidičáku správně neukázala.
- Mapu výletu (MapLibre) v offline režimu a instalaci aplikace na plochu.
- Skutečný tisk na tiskárně – jen tiskový náhled a PDF.
