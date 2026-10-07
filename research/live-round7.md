# Živá kontrola nasazeného webu – kolo 7

- **Web:** https://atlas-letenky.onrender.com (main `6df53c6`)
- **Kdy:** 7. 10. 2026, skutečný Chrome (playwright-core, `channel: 'chrome'`, čistý profil, cs-CZ)
- **Šířky:** 1300×900 a 390×844; formulář letů, režim autem a země navíc na 320×720
- **Kód aplikace nebyl měněn.** Skripty, JSON výstupy a snímky jsou na PC v `%TEMP%\atlas-qa\live7\`.

## Shrnutí

Všechny kontrolované body fungují. Nenašel jsem žádnou chybu, která by něco rozbíjela: žádná chyba JavaScriptu, žádné vodorovné přetečení na žádné šířce, žádná odpověď API 4xx/5xx.
Našel jsem **1 věcnou nepřesnost v datech** (parkování Wrocław) a **6 drobností** – viz „Nálezy“.

## Tabulka bodů

| # | Bod | Výsledek | Poznámka |
|---|-----|----------|----------|
| 1a | Výchozí „Odkud“ v čistém profilu | ✅ | Pole je prázdné, nápověda „město, letiště, země nebo tvoje poloha“, nahoře „📍 Nastav, odkud létáš“, okruh 200 km, žádné čipy, prázdný localStorage. |
| 1b | Čipy letišť veřejnou dopravou z Prahy | ✅ | Všech 8 hodnot přesně podle očekávání (tabulka níže). |
| 2a | Palivo: nafta (výchozí), benzín, ⚡ elektro, vlastní cena | ✅ | Řádek „nafta 50,65 Kč/l · ČSÚ, týden 28. 9.–4. 10.“. Přepínání mění spotřebu, jednotky i čipy. |
| 2b | Parkování základ + Kč/den | ✅ | Všechny vzorky sedí se zadáním (tabulka níže). |
| 2c | Wrocław – skutečné ceny | ⚠️ | Odhad 230 + 120 Kč/den neodpovídá ceníku: krátké stání podhodnocuje, dlouhé nadhodnocuje. Návrh **600 + 65 Kč/den**. |
| 2d | Pás „Nejbližší dny“ s parkováním | ✅ | Zobrazí se, když jsou známé ceny okolních dnů (Praha → Londýn). Parkování se přepočítává podle délky. Drobnost N3. |
| 2e | „Návrat i na jiné letiště“ vypnutý v režimu autem | ✅ | Zaškrtávátko vypnuté a odškrtnuté, viditelné vysvětlení; po návratu na veřejnou dopravu se zase zapne a zaškrtne. |
| 3a | Lagos → Porto Novo → Abeokuta | ✅ | Autem 126 km ~3 h 25 min, busem ~6 h 10 min, hranice Nigérie → Benin s vízem. |
| 3b | Vídeň → Brno → Budapešť veřejnou dopravou | ✅ | Vídeň → Brno ~1 h 50 min „(jízdní řád…)“, Brno → Budapešť ~4 h „(odhad…)“. Drobnost N6. |
| 4 | Odkazy na ubytování | ✅ | Všech 9 odkazů u každého místa. Termín i hosté se předvyplní všude, kde to má být; výjimky jsou v aplikaci označené „zadej data“. Drobnosti N4, N5. |
| 5a | Katar | ✅ | Nadpis jen „🛂 Vízum při příletu“. |
| 5b | Benin | ✅ | Žlutá zimnice jen v řádku „Povinné očkování“, v doporučených není. |
| 5c | Bělorusko | ✅ | Varování MZV v hlavičce i v poznámce. |
| 6a | Sdílení cesty (`#trip=`) v novém profilu | ✅ | Text shrnutí je znak po znaku stejný (3 373 znaků), bez chyb v konzoli. |
| 6b | Sdílení plánu z plánovače (`#plan=`) v novém profilu | ✅ | Náhled „Sdílený plán“, po přidání stejná data i stejný text. |
| 6c | .ics | ✅ | Shrnutí cesty: 9 událostí, platný VCALENDAR, CRLF, žádný řádek nad 75 bajtů. Plánovač: 5 událostí. |
| 6d | Hlídání ceny | ✅ | Uloží se s popisem „🚗 na letiště autem (nafta)“ a cenou 15 444 Kč. Drobnost N2. |
| 6e | „Je to dobrá cena?“ | ✅ | Panel se všemi oddíly (ostatní nabídky, vzdálenost, paměť, do odletu, doporučení). |
| 6f | Chyby v konzoli | ✅ | Žádná chyba JavaScriptu ani chyba v konzoli při běžné práci. Viz N7. |
| 6g | Vodorovné přetečení | ✅ | 0 případů na 1300, 390 i 320 px (formulář, čipy, výsledky, trasa, ubytování, shrnutí, země, plánovač, sdílený odkaz). |

## 1. Čipy letišť – veřejnou dopravou z Prahy (Kč/os. tam)

| Letiště | Očekáváno | Web | |
|---|---|---|---|
| PRG | 50 | ~50 | ✅ |
| KLV | 220 | ~220 | ✅ |
| PED | 200 | ~200 | ✅ |
| DRS | 430 | ~430 | ✅ |
| JCL | 230 | ~230 | ✅ |
| MUC | 480 | ~480 | ✅ |
| BER | 500 | ~500 | ✅ |
| VIE | 440 | ~440 | ✅ |

MUC, BER a VIE jsou vidět až po zvětšení okruhu (měřeno s okruhem 400 km; ve výchozích 200 km je jen PRG, KLV, PED, DRS, JCL). Stejné hodnoty na 390 i 320 px.

## 2. Režim autem

**Palivo** (Praha, 2 osoby):

| Volba | Spotřeba | Řádek s cenou | Kč/km |
|---|---|---|---|
| ⛽ nafta (výchozí) | 6 l/100 km | nafta 50,65 Kč/l · ČSÚ, týden 28. 9.–4. 10. | ≈ 3,04 |
| ⛽ benzín | 7 l/100 km | benzín N95 45,87 Kč/l · ČSÚ, týden 28. 9.–4. 10. | ≈ 3,21 |
| ⚡ elektro | 19 kWh/100 km | nabíjení DC ~16 Kč/kWh (ceníky ČEZ, PRE, E.ON, IONITY, Tesla – stav 6. 10. 2026) | ≈ 3,04 |
| vlastní cena 40 Kč/l | 6 l/100 km | čip: „nafta 40,00 Kč/l · vlastní cena“ | ≈ 2,40 (vlastní cena) |

U elektra se zobrazí poznámka, že parkování a známky platí stejně. „Jen tam“ přepne čipy na „(odvoz)“ bez parkování (PRG ~50 Kč/os.).

**Parkování** (z popisku čipu, „online předem“):

| Letiště | Očekáváno | Web | |
|---|---|---|---|
| PRG Praha | 590 + 120 | 590 + 120 | ✅ |
| BRQ Brno | 170 + 160 | 170 + 160 | ✅ |
| PED Pardubice | zdarma | „parkování u letiště zdarma“ | ✅ |
| OSR Ostrava | 130/den | 130 Kč/den, bez základu | ✅ |
| MUC Mnichov | 790 + 100 | 790 + 100 | ✅ |
| KRK Krakov | 430 + 90 | 430 + 90 | ✅ |

Další zobrazené: KLV 280 + 50, DRS 540 + 120, JCL 120 + 60, LEJ 750 + 160, LNZ 740 + 100, NUE 1 580 + 220, BER 1 260 + 100, SZG 1 170 + 70, VIE 850 + 150, BTS 670 + 100, KTW 190 + 70, BUD 400 + 50, WAW 300 + 160, WMI 180 + 100, FRA 1 450 + 280.
Kontrola výpočtu: PRG na 8 dní = 98 Kč palivo + 590 + 8 × 120 = 1 648 Kč za auto, 825 Kč/os. – čip ukazuje ~830 Kč/os. ✅

### Wrocław (WRO) – skutečné ceny

**Zdroj:** oficiální online rezervace letiště, https://rezerwacja.airport.wroclaw.pl/ (v běžném okně Chromu se načte bez blokování). Ceny jsem přečetl dvojím způsobem a shodují se: z rezervačního formuláře pro příjezd **st 28. 10. 2026 12:00** a z tabulky „Ceny parkingu przy rezerwacji online“ na téže stránce. Cena je stejná při rezervaci „aspoň 4 dny předem“ i „1–3 dny předem“. Kurz 5,8 Kč/zł.

| Délka | Parking D dlouhodobý | v Kč | Parking A/B/C/D | Parking VIP | Aplikace teď (230 + 120/den) | Rozdíl proti D |
|---|---|---|---|---|---|---|
| 1 den | 79 zł | 458 Kč | 89 zł | 149 zł | 350 Kč | −24 % |
| 3 dny | 139 zł | 806 Kč | 169 zł | 329 zł | 590 Kč | −27 % |
| 7 dní | 199 zł | 1 154 Kč | 299 zł | 639 zł | 1 070 Kč | −7 % |
| 14 dní | 269 zł | 1 560 Kč | 519 zł | 998 zł | 1 910 Kč | +22 % |

Celá tabulka pro Parking D (online): 1 den 79 · 2 dny 109 · 3 dny 139 · 4 dny 159 · 5 dní 179 · 6 dní 189 · 7–9 dní 199 · 10 dní 209 · 11 dní 219 · 12 dní 239 · 13 dní 249 · 14–15 dní 269 · 16 dní 289 zł · každý další den +10 zł.
Bez rezervace (ceník „standardowy“, Parking D): 1 den 99 · 3 dny 189 · 7 dní 319 · 14 dní 389 zł.

**Závěr:** odhad není jednoduše „moc vysoký“ – do 7 dní je nižší než skutečnost, od zhruba 9 dní vyšší (15 dní: 2 030 Kč proti 1 560 Kč, +30 %).

**Návrh opravy:** `WRO: [..., [600, 65]]` v `server/lib/access.js`. Porovnání se skutečností:

| Dní | 2 | 3 | 5 | 7 | 8 | 10 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|
| Skutečnost (Kč) | 632 | 806 | 1 038 | 1 154 | 1 154 | 1 212 | 1 560 | 1 560 | 1 676 |
| 600 + 65/den | 730 | 795 | 925 | 1 055 | 1 120 | 1 250 | 1 510 | 1 575 | 1 640 |
| Odchylka | +15 % | −1 % | −11 % | −9 % | −3 % | +3 % | −3 % | +1 % | −2 % |

Jediná větší odchylka je 1 den (665 Kč proti 458 Kč).

### Pás „Nejbližší dny“

- Praha → Lagos (přesná data 28. 10.–11. 11.): pás se nezobrazí. Podle kódu je to záměr – pro okolní dny nejsou známé ceny.
- Praha → Londýn, autem, 28. 10.–2. 11.: pás se zobrazí s textem „nejlevnější let daného dne v Kč/os. vč. cesty autem a parkování na celou cestu (kdyby se změnil jen tento den)“. V popisku každého dne je parkování podle délky: 6 dní ~655 Kč/os., 9 dní ~835 Kč/os., 3 dny ~475 Kč/os. Sedí s 590 + 120/den děleno 2.
- Klik na den (25. 10.) přepíše datum ve formuláři a hledá znovu; výsledek ukazuje parkování na 9 dní ~835 Kč/os. ✅

## 3. Trasa po víc místech

**Lagos → Porto Novo → Abeokuta** (v cestě Praha → Lagos, 13 nocí):

| Úsek | Autem | Autobusem | Hranice |
|---|---|---|---|
| Lagos → Porto Novo | 126 km · ~3 h 25 min (podle trasy) | ~6 h 10 min (odhad) | 🛂 Nigérie → Benin – „počítej s kontrolou a vízem (Benin: e-vízum)“ |
| Porto Novo → Abeokuta | 210 km · ~3 h 55 min (podle trasy) | ~6 h 50 min (odhad) | 🛂 Benin → Nigérie – „(Nigérie: e-vízum)“ |

Přepínač se jmenuje „🚌 Autobusem“, slovo „vlak“ se nikde neobjeví. Je tu i upozornění na půjčené auto přes hranici a na dlouhé přejezdy.

**Vídeň → Brno → Budapešť** (místa jsem vyměnil ve stejné cestě, proto úseky z/na letiště LOS nedávají smysl – to je dáno testem, ne chyba):

| Úsek | Veřejnou dopravou | Autem |
|---|---|---|
| Vídeň → Brno | 🚆 ~1 h 50 min vlakem / busem **(jízdní řád**; autem ~2 h 10 min) | 139 km · ~2 h 10 min |
| Brno → Budapešť | 🚆 ~4 h vlakem / busem (odhad; autem ~3 h 30 min) | 328 km · ~3 h 30 min |

Přepínač se tu jmenuje „🚆 Vlakem a busem“. API vrací `transitKind: "rail"`, u Vídeň → Brno navíc `fast: true`.

## 4. Odkazy na ubytování – co se skutečně předvyplní

Otevřeno v Chromu (cs-CZ), 2 dospělí. Lagos 29. 10.–9. 11., Porto Novo 9.–10. 11., Abeokuta 10.–11. 11., Vídeň/Brno/Budapešť 9.–11. 11.

**Lagos – všech 9 odkazů:**

| Partner | Místo | Data | Hosté | Výsledky | |
|---|---|---|---|---|---|
| Booking (hodnocení 8+) | Lagos | 29. 10.–9. 11. | 2 dospělí · 1 pokoj | 133 | ✅ |
| Booking (poměr cena/hodnocení) | Lagos | 29. 10.–9. 11. | 2 dospělí · 1 pokoj | 555 | ✅ |
| Airbnb | Lagos | 29. 10.–9. 11. | 2 hosté | přes 1 000 | ✅ |
| Trip.com (`cityId=783`) | Lagos | Oct 29–Nov 9 | 1 room, 2 adults | 1 654 | ✅ (USD, anglicky – N5) |
| Hotels.com | Lagos, Lagos, Nigeria | Oct 29–Nov 9 | 2 travelers, 1 room | 458 | ✅ (USD, anglicky) |
| Kayak (`Lagos-Nigeria`) | Lagos | Oct 29–Nov 9 | 2 guests | 2 173 | ✅ (USD, anglicky – N5) |
| Google Hotels (`ts`) | Lagos | čt 29. 10.–po 9. 11. | 2 | 2 820 | ✅ |
| Hostelworld | Lagos, Nigeria | **nepředvyplněno** (8–11 Oct) | 2 | 0 hostelů | ⚠️ označeno „zadej data“ – N4 |
| Agoda (`search?city=20711`) | Lagos | 29. 10.–9. 11. | 2 dospělí, 1 pokoj | 251 | ✅ |

**Ostatní místa – Trip.com, Agoda, Hostelworld, Kayak, Google Hotels:**

| Místo | Trip.com | Agoda | Hostelworld | Kayak | Google Hotels |
|---|---|---|---|---|---|
| Porto Novo | ✅ `cityId=648595`, data, 2 dospělí, 10 | ⚠️ jen úvodní stránka, označeno „zadej místo a data“ | ⚠️ stránka města, 0 hostelů, „zadej data“ | ✅ `Porto-Novo-Benin`, data, 2 hosté, 55 | ✅ data, 2 hosté, 2 |
| Abeokuta | ✅ `cityId=276780`, 68 | ✅ `city=166137`, data, 2 dospělí, 38 | ⚠️ 0 hostelů, „zadej data“ | ✅ `Abeokuta-Nigeria`, 83 | ✅ 163 |
| Vídeň | ✅ `cityId=651`, 1 557 | ✅ `city=16582`, 2 356 | ✅ `pwa/s?type=city&id=38`, 9–11 Nov, 2 hosté, 47 | ✅ `Vienna-Austria`, 2 420 | ✅ 15 000 |
| Brno | ✅ `cityId=3455`, 195 | ✅ `city=8366`, 429 | ✅ `id=1844`, 9–11 Nov, 2 hosté, 32 | ✅ `Brno-Czech-Republic`, 401 | ✅ 19 |
| Budapešť | ✅ `cityId=637`, 2 123 | ✅ `city=10647`, 3 526 | ✅ `id=50`, 9–11 Nov, 2 hosté, 41 | ✅ `Budapest-Hungary`, 2 822 | ✅ 1 496 |

Žádný partner neukázal captchu ani chybovou stránku. Kayak si adresu sám doplní o své ID (`Lagos-Nigeria-c25271`).
Hostelworld s ID (`pwa/s?type=city&id=…`) otevírá rovnou termín a hosty; pro tři africká města aplikace ID nemá a posílá na stránku města.

## 5. Země

- **Katar:** nadpis „🛂 Vízum při příletu“ (nic dalšího v nadpisu). Max. pobyt 90 dní, pas 6 měsíců. Poznámka: „Vízum při příletu zdarma: 30 dní (1 vstup) nebo 90 dní (více vstupů)“. Varování MZV kvůli konfliktu s Íránem je v hlavičce i v poznámce.
- **Benin:** „💉 Povinné očkování: žlutá zimnice – dle WHO a MZV povinná pro všechny; Benin od 9/2026 průkaz na hranicích nekontroluje“. V „Doporučené“ je jen hepatitida A a B, břišní tyfus, meningokok, antimalarika – žlutá zimnice tam není. E-vízum ~50 € (≈ 1 220 Kč).
- **Bělorusko:** v hlavičce „MZV ČR důrazně varuje před cestami do Běloruska a vyzývá k opuštění země“, totéž v poznámce u vstupu. Režim „Bez víza – jen s cestovním pasem“, 30 dní.

Stejně na 1300, 390 i 320 px, bez přetečení.

## 6. Sdílení, .ics, hlídání, dobrá cena

- **Sdílení cesty:** „🔗 Zkopírovat odkaz na cestu“ → hláška „Odkaz zkopírován – pošli ho komukoliv“, odkaz `#trip=…` má 9 556 znaků. V novém profilu se otevře shrnutí se stejným textem (letenky 25 112 Kč, autem 5 776 Kč, 3 místa, víza Nigérie + Benin, celkem 45 868 Kč).
- **Sdílení plánu:** po „💾 Uložit do plánovače“ → „🔗 Sdílet“, odkaz `#plan=…` má 2 147 znaků. V novém profilu náhled „Sdílený plán · Lagos · 28.10. – 11.11. · 2 os.“, po „Přidat do plánovače“ jsou data plánu i zobrazený text shodné.
- **.ics ze shrnutí** (`atlas-Lagos-2026-10-29.ics`): 2 lety, 3× ubytování, 2× přejezd, 2× „Vyřídit e-vízum“ (Nigérie, Benin).
- **.ics z plánovače** (`atlas-Lagos-29.10.ics`): celá cesta, 2 lety, 2× e-vízum – ubytování a přejezdy v něm nejsou (viz N8).
- **Hlídání ceny:** „♡ Hlídat cenu“ → „Hledání uloženo – cenu hlídám na Přehledu, dokud máš ATLAS otevřený“.
- **„Je to dobrá cena?“:** VIE → Lagos 12 556 Kč/os., „💚 Dobrá cena“, o 12 % pod průměrem na vzdálenost, do odletu 21 dní.

## Nálezy

### N1 – Parkování Wrocław neodpovídá ceníku (nepřesná data)
- **Postup:** Lety → Odkud Praha (okruh 400 km) nebo Vratislav → Další možnosti → 🚗 autem → popisek čipu WRO.
- **Co se stalo:** „parkování online předem ~230 Kč + 120 Kč/den“. Skutečný oficiální ceník je 458 / 806 / 1 154 / 1 560 Kč na 1 / 3 / 7 / 14 dní.
- **Návrh:** `[600, 65]`, zdroj a tabulka výše. Do komentáře v `access.js` doplnit „rezerwacja.airport.wroclaw.pl, Parking D 79 / 139 / 199 / 269 zł, ověřeno 10/2026“.

### N2 – Hlídání ceny jde uložit dvakrát (drobnost)
- **Postup:** vyhledat Praha → Lagos → „Je to dobrá cena?“ → „♡ Hlídat cenu tohoto hledání“ → zavřít panel → „♡ Hlídat cenu“ pod formulářem.
- **Co se stalo:** v seznamu hlídání jsou dvě stejné položky „Praha → Lagos · tam 28.10. · zpět 11.11.“. Stejně na desktopu i mobilu.
- **Návrh:** v `addWatch()` před `unshift` zkontrolovat, jestli už položka se stejným hledáním existuje, a místo přidání ukázat „Tohle hledání už hlídáš“.

### N3 – „Nejbližší dny“ v režimu autem: řádky Tam a Zpět nejdou sečíst (drobnost)
- **Postup:** Praha → Londýn, přesná data 28. 10.–2. 11., 🚗 autem.
- **Co se stalo:** Tam st 28. 10. = 3 145, Zpět po 2. 11. = 1 473, dohromady 4 618 Kč, ale nejlevnější cesta v těchto dnech stojí 3 963 Kč/os. Každý řádek totiž obsahuje celou cestu autem i parkování (705 Kč/os.), takže je v součtu dvakrát. Popisek to říká („vč. … parkování na celou cestu“), ale čísla vedle sebe svádějí k sečtení.
- **Návrh:** započítat auto a parkování jen do řádku Tam, nebo pod pás dopsat „ceny řádků nesčítej – auto a parkování je v obou“.

### N4 – Hostelworld u měst bez ID vede na prázdnou stránku (drobnost)
- **Postup:** cesta Lagos → Porto Novo → Abeokuta → Ubytování → Hostelworld.
- **Co se stalo:** otevře se `hostelworld.com/hostels/africa/nigeria/lagos/` s „0 Hostels in Lagos“ a daty 8–11 Oct. Aplikace odkaz poctivě označuje „zadej data“, ale i po zadání dat tam nic není.
- **Návrh:** u míst bez ID Hostelworld odkaz skrýt, nebo ho přesunout na konec s popiskem „hostely tu nejspíš nejsou“.

### N5 – Trip.com a Kayak se otevírají anglicky a v USD (drobnost)
- **Co se stalo:** Trip.com ignoruje `curr=CZK&locale=cs-CZ` (zkoušel jsem i `currency=CZK`, beze změny; `cz.trip.com` neexistuje). Kayak.com ukazuje USD.
- **Návrh pro Kayak (ověřeno):** `https://www.cz.kayak.com/hotels/Lagos-Nigeria/2026-10-29/2026-11-09/2adults` se otevře česky, v CZK, se stejným místem, daty a hosty (1 019 výsledků). U Trip.com jsem řešení nenašel. Hotels.com je také anglicky; `cs.hotels.com` přesměruje zpět na anglickou verzi v EUR.

### N6 – Popisek „vlakem / busem“ i tam, kde jede přímý vlak (drobnost)
- **Co se stalo:** Vídeň → Brno má `transitKind: "rail"` a „(jízdní řád)“, ale text je „vlakem / busem“. Zadání čekalo „vlakem“.
- **Návrh:** když je čas z jízdního řádu vlaku, psát jen „vlakem“.

### N7 – Jeden přerušený požadavek `/api/search` na každé hledání (jen informace)
- V síťovém záznamu je u každého hledání jeden požadavek `/api/search` ukončený `net::ERR_ABORTED`. V konzoli se neprojeví a výsledky jsou úplné – vypadá to na záměrné zrušení předchozího požadavku.
- První načtení webu po delší nečinnosti vrátilo 503 (uspávání na Renderu), stránka naběhla asi za 17 s. Další načtení 200 do 4 s.

### N8 – .ics z plánovače je chudší než .ics ze shrnutí (jen informace)
- Po uložení cesty do plánovače má kalendář 5 událostí místo 9 – chybí ubytování a přejezdy mezi místy. Pokud je to záměr (plánovač ukládá jen dny a aktivity), není co opravovat.

### Kosmetika
- V čipech letišť (Odkud Ostrava nebo Krakov, okruh 400 km) je „RDO **RADOM**“ velkými písmeny, ostatní města mají běžný zápis.

## Co jsem neověřil

- Jízdní doby jsem neporovnával s živým jízdním řádem ani s Google Maps; zapsal jsem jen to, co ukazuje aplikace.
- Odkazy na partnery jsem otevíral jen na šířce 1300 px.
- Trasu Vídeň → Brno → Budapešť jsem zadal uvnitř cesty do Lagosu, ne v cestě s letem do Vídně.
- Nabídky hotelů přímo v aplikaci (LiteAPI) mají u Lagosu a Abeokuty upozornění „Ukázková / testovací nabídka – hotely a ceny nejsou skutečné“; jejich ceny jsem nekontroloval.
