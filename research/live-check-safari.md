# Živá kontrola – Safari (Playwright WebKit)

- **Web:** https://atlas-letenky.onrender.com (zdroj stránky obsahuje „Object.hasOwn = function“, opravy z PR #30 jsou nasazené)
- **Kdy:** 7. 10. 2026
- **Čím:** Playwright WebKit 26.6 (revize 2359) na Windows, bez okna, přes playwright-core 1.63.0. Dva profily:
  - **A) iPhone 13** – 390 px, 3× hustota, uživatelský agent iOS;
  - **B) Safari na počítači** – 1300×900.
- **Instalace:** Peter ji potvrdil přímo v okně na PC. Staženo do `%LOCALAPPDATA%\ms-playwright`, bez admin práv, celkem **174 MB** (WebKit 171 MB, ffmpeg 3,4 MB, winldd 0,3 MB). Nechávám to tam pro další kontroly. Balík `playwright` jsem neinstaloval – stačil playwright-core, který na PC už byl.
- **Kód aplikace nebyl měněn.** Skript, JSON a všechny snímky jsou na PC v `%TEMP%\atlas-qa\live9\` (`safari.js`, `safari-iphone.json`, `safari-desktop.json`), výběr snímků ve složce `live-check-safari/`.

## Shrnutí

V obou profilech prošlo všechno: **0 chyb JavaScriptu, 0 chyb v konzoli, 0 selhaných požadavků na náš web, 0 odpovědí 4xx/5xx, 0 vodorovných přetečení.** Hledání i ceny fungují, čísla jsou stejná jako v Chromu a Edge.

Na snímcích jsou proti Chromu **tři vzhledové rozdíly** (V1–V3). U všech tří nedokážu z tohoto testu rozhodnout, jestli by byly vidět i ve skutečném Safari, nebo jde o vlastnost WebKitu pro Windows – na skutečném iPhonu nebo Macu to chce jeden pohled.

**Meze testu:** Playwright WebKit má stejné jádro jako Safari, ale není to Safari na skutečném zařízení. Neověřil jsem instalaci na plochu iPhonu, animaci startu, bezpečné okraje displeje, chování klávesnice ani offline režim.

## Tabulka bodů

| Bod | iPhone 13 | Safari 1300 | Poznámka |
|---|---|---|---|
| Přehled | ✅ | ✅ | 4 dlaždice. Úvodní obrazovka se v běžné kartě neukáže (prvek `#launch` je odstraněn), nic nepadá. |
| `Object.hasOwn` | ✅ | ✅ | `typeof Object.hasOwn === 'function'`. |
| Lety: Praha → kamkoli | ✅ | ✅ | Našeptávač, čipy letišť (PRG 50 / KLV 220 / PED 200 / DRS 430 / JCL 230), 150 destinací, všechny čtyři zdroje cen, 149 štítků cesty z letiště. |
| Pohled Mapa | ✅ | ✅ | Světlá mapa, 150 bodů, barva bodů = barva legendy, popisky s bílým obrysem (`paint-order: stroke` funguje). Na iPhonu je vidět 6 popisků a nepřekrývají se. |
| Praha → Paříž, přesná data | ✅ | ✅ | 40 nabídek, Nejbližší dny, štítky CDG/BVA, součet 5 930 + 100 + 780 = 6 810 Kč. Vzhled polí s datem viz V2. |
| Otevřít nabídku | ✅ | ✅ | Panel „Je to dobrá cena?“ se otevře; „Vybrat a pokračovat“ přejde do Cesty. |
| Cesta – kroky | ✅ | ✅ | Let, Trasa, Ubytování, Auto, Program (mapa MapLibre se vykreslí, WebGL funguje), Shrnutí. |
| Karta „Co zařídit a co sbalit“ | ✅ | ✅ | Odškrtnutí 2 položek → „✔ 2/24“. **Vlastní položka jde přidat** přímo v kartě (pole „Přidat vlastní položku…“ + „+ Přidat“). Odškrtnutí i vlastní položka přežijí obnovení stránky. |
| Stránka Mapa | ✅ | ✅ | Světlá mapa, skutečné kliknutí/ťuknutí do Brazílie otevře bublinu, „Byl/a jsem tu“ → „Přidáno: Brazílie“. Navštívené země mají přechod. Zoom drží hranice 0,7 px. ☾ přepne na tmavou a zpět. |
| Země | ✅ | ✅ | 197 karet, detail Japonska s počasím, vlajky se vykreslí (písmo Twemoji načteno). |
| Objevuj, Plánovač, Doporučení | ✅ | ✅ | Otevřou se bez chyb. |
| Chyby v konzoli (`error`) | ✅ 0 | ✅ 0 | |
| `pageerror` | ✅ 0 | ✅ 0 | |
| Selhané požadavky na náš web | ✅ 0 | ✅ 0 | |
| Vodorovné přetečení | ✅ 0 | ✅ 0 | Ve všech 20 kontrolovaných obrazovkách. |
| Rozbalovače (select) | ✅ | ✅ | `appearance: none` + vlastní šipka – jen jedna šipka, žádná navíc. |

Jediné varování v konzoli (ne chyba): „Expected value to be of type number, but found null instead.“ v kroku Program – varování knihovny MapLibre, stejné je i v Chromu a Edge.

## Vzhledové rozdíly proti Chromu

### V1 – Na iPhonu prosvítá obsah pod horní lištou a kříží se s nadpisem
- **Postup:** profil iPhone 13 → Lety nebo Cesta → posunout stránku dolů.
- **Co je vidět:** horní lišta (název stránky, podtitul, čip „📍 Praha…“, tlačítko obnovit) má průhledné pozadí s `backdrop-filter: blur(8px)`. V testovacím WebKitu se rozmazání nevykreslilo, takže text stránky je pod lištou ostře čitelný a překrývá se s nadpisem („Hygienické potřeby“ přes „→ program → shrnutí“, čipy aerolinek přes „Nejlevnější letenky ze všech letišť v okolí“). Snímky `safari-iphone-13-pretrip-pack.png`, `safari-iphone-05-results-map.png`, `safari-iphone-08-paris-offer.png`.
- **Co vím a nevím:** styly předponu `-webkit-backdrop-filter` mají (v `atlas.css` u všech 6 pravidel), prohlížeč vlastnost hlásí jako podporovanou a vypočtená hodnota je `blur(8px)`. Nevykreslení tedy může být jen vlastnost WebKitu pro Windows bez okna. Na skutečném iPhonu jsem to neviděl.
- **Návrh (pomůže v obou případech):** dát liště na mobilu polo-neprůhledné pozadí, např. `background: rgba(8,12,26,.82)` ve tmavém a světlý ekvivalent ve světlém režimu. Čitelnost pak nezávisí na rozmazání; v Chromu se vzhled skoro nezmění.

### V2 – Pole s datem ukazují „2026-10-28“ jako obyčejný text
- **Kde:** „Odlet mezi“ a „Odlet tam a návrat zpět“ (snímky `safari-iphone-06-exact-dates.png`, `safari-desktop-06-exact-dates.png`, `safari-desktop-03-more-options.png`).
- **Co je vidět:** pole se v testovacím WebKitu hlásí jako `type="text"`, bez kalendáře, s hodnotou ve tvaru RRRR-MM-DD. Hodnoty se dají přepsat a hledání s nimi funguje.
- **Co vím a nevím:** WebKit pro Windows nemá nativní výběr data, skutečné Safari na iPhonu i Macu ho má. Nejspíš jde tedy jen o vlastnost testu. Kdyby to tak ale vypadalo v některém starším prohlížeči, je formát RRRR-MM-DD pro českého uživatele nezvyklý.
- **Návrh (volitelný):** když prohlížeč `type="date"` nepodporuje (`input.type !== 'date'` po nastavení), přidat k poli nápovědu „RRRR-MM-DD“.

### V3 – Tučné písmo se kreslí tence
- **Co je vidět:** nadpisy („Lety“, „Japonsko“), ceny („6 810 Kč“) a časy letů jsou na snímcích z WebKitu v běžné tloušťce, v Chromu jsou tučné.
- **Co vím a nevím:** písma Inter a Sora se načetla (stav „loaded“, stejné soubory jako v Chromu), vypočtená tloušťka je 800 a šířka nadpisu je na pixel stejná jako v Chromu (139 px). Rozvržení tedy s tučným řezem počítá, jen vykreslení ve WebKitu pro Windows osu tloušťky proměnného písma nepoužilo. Ve skutečném Safari proměnná písma fungují, takže to nejspíš uvidět nebude – ověřit jde jen na zařízení.

### Co vypadá stejně jako v Chromu
- Mapy (světlá i tmavá, navštívené země, body a legenda), karty zemí, štítky cesty z letiště včetně zvýrazněného rámečku, pás Nejbližší dny, karta Co zařídit, spodní navigace na iPhonu (má neprůhledné pozadí, takže je čitelná i bez rozmazání).
- Zaškrtávátka a posuvníky mají vzhled WebKitu (bílá zaoblená políčka, kulatý jezdec), což je očekávané.
- Číselná pole mají na počítači krokovací šipky – běžný vzhled Safari.

## Co je na snímcích

| Snímek | Co ukazuje |
|---|---|
| `safari-iphone-01-dashboard.png`, `safari-desktop-01-dashboard.png` | Přehled |
| `safari-iphone-04-results-anywhere.png` | Výsledky „kamkoli“ na iPhonu |
| `safari-iphone-05-results-map.png`, `safari-desktop-05-results-map.png` | Mapa výsledků (na iPhonu i V1) |
| `safari-iphone-06-exact-dates.png`, `safari-desktop-06-exact-dates.png` | Pole s datem (V2) |
| `safari-desktop-03-more-options.png` | Další možnosti – rozbalovač, zaškrtávátka, číselná pole |
| `safari-iphone-08-paris-offer.png`, `safari-desktop-07-paris-results.png` | Nabídka do Paříže, štítky, rozpis ceny |
| `safari-desktop-11-trip-program.png` | Program s mapou MapLibre |
| `safari-iphone-12-pretrip-top.png`, `safari-iphone-13-pretrip-pack.png`, `safari-desktop-12-pretrip-top.png` | Karta Co zařídit a co sbalit |
| `safari-iphone-16-map-visited.png`, `safari-iphone-18-map-dark.png`, `safari-desktop-16-map-visited.png` | Stránka Mapa |
| `safari-iphone-20-country-detail.png`, `safari-desktop-20-country-detail.png` | Detail země |

## Co jsem neověřil

- Skutečné Safari na iPhonu nebo Macu – V1 až V3 je potřeba potvrdit nebo vyvrátit tam.
- Přidání na plochu iPhonu, animaci startu, výřez displeje a bezpečné okraje, softwarovou klávesnici.
- Offline režim a service worker ve WebKitu (v zadání nebyl).
- Dotyková gesta na mapě (tažení dvěma prsty, přiblížení) – zkoušel jsem jen ťuknutí a tlačítka +/−.
- Starší verze Safari (testováno jen jádro 26.6).
