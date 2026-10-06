# ATLAS – QA 7. kolo (předběžná kontrola před nasazením)

- **Verze:** `origin/claude/quirky-fermi-jwt2po` na **c340cb2** („Merge airport access costs and current fuel prices"), dočasný pracovní strom `%TEMP%\atlas-qa\wt-qa7` (větev `qa7`)
- **`npm test`:** 349 testů, 349 prošlo, 0 selhalo
- **Server:** místně, `ATLAS_MOCK=0`, `PORT=8097`; Ryanair, Wizz Air a Kiwi živě, **bez klíčů LiteAPI a Travelpayouts** (hotely a „Ostatní aerolinky" vypnuto)
- **Prohlížeč:** Google Chrome přes playwright-core (`channel: 'chrome'`), 1300×900 a 390×844, čistý profil, 6. 10. 2026
- **Kód v repozitáři jsem neměnil.** Skript `round7.js`, snímky a surová data jsou v `%TEMP%\atlas-qa\round7\`.

## Shrnutí

Všechny body prošly na obou rozlišeních: **0× pageerror, 0× chyba v konzoli, 0× HTTP ≥ 400, žádné vodorovné přetečení**. Jediný `requestfailed` je známý neškodný `ERR_ABORTED` u `POST /api/search` po dokončení hledání.

Našel jsem **1 chybu** (odkaz na Kayak nevede na výsledky) a **3 věci k doladění** (parkování počítané lineárně za den, podhodnocená jízdenka do Drážďan, delší trasa Porto Novo → Abeokuta než podle Googlu).

| Bod | 1300×900 | 390×844 |
|---|---|---|
| a) Trasa po víc místech (Lagos → Porto Novo → Abeokuta, + Cotonou) | ✅ | ✅ |
| b) Ubytování na trase – odkazy u každého místa | ✅, Kayak ❌ (B1) | ✅, Kayak ❌ |
| c) Čipy letišť, „Na letiště: autem", výsledky | ✅ (P1, P2) | ✅ |
| d) Země: Katar, Bělorusko, Slovinsko | ✅ | ✅ |
| e) Chyby, přetečení | ✅ | ✅ |

**Co se nedalo ověřit:** hlášku „chybí město nebo země" vyhazuje jen LiteAPI. Bez klíče se místně u všech míst ukáže „Přímé nabídky ubytování zatím nejsou zapnuté" a 9 odkazů, takže tuhle cestu jsem nevyzkoušel. Dotazy `/api/stays` ale u všech čtyř míst nesly `city`, `country` i `cc` (Lagos NG, Cotonou BJ, Porto Novo BJ, Abeokuta NG).

## Chyby a postřehy

### B1 – Odkaz na Kayak skončí na úvodní stránce bez předvyplnění (střední)

**Postup:** Lety → Odkud Praha, Kam Lagos, přesná data 20. 10. – 10. 11. → vybrat let → krok 🗺️ Trasa → „Víc míst" → Pokračovat k ubytování → u libovolného místa otevřít odkaz „Kayak – srovnání cen více webů".

**Co se stane:** `https://www.kayak.com/hotels/Cotonou%2C%20Benin/2026-11-07/2026-11-08/2adults` se přesměruje na `https://www.kayak.com/stays` – úvodní stránka, bez města, bez dat, výchozí „2 guests, 1 room". Stejně u všech čtyř míst (Lagos, Cotonou, Porto Novo, Abeokuta) na obou rozlišeních.

**Příčina:** Kayak nepřijme tvar „Město, Země" bez číselného ID. Samotné jméno města funguje – ověřeno v průzkumu route7: `https://www.kayak.com/hotels/Cotonou/2026-11-22/2026-11-23/1adults` se přesměruje na `…/Cotonou-c22853/…` s vyplněným městem, daty i hosty.

**Návrh:** v `server/lib/links.js` posílat do cesty jen jméno města (bez země), případně `Město-c{ctid}`.

### P1 – Parkování u letiště je lineární cena za den; krátké cesty vychází 2–4× levněji než ve skutečnosti (střední)

Aplikace počítá Praha 200 Kč/den, Vídeň 300 Kč/den (`server/lib/access.js`). Skutečné ceny k 6. 10. 2026 (příjezd 27. 10., oficiální weby letišť):

| | 1 den | 3 dny | 7 dní | 14 dní |
|---|---|---|---|---|
| **Praha – ATLAS** | 200 | 600 | 1 400 | 2 800 |
| Praha – online, nejlevnější | 780 | 850 | 1 450 | 2 280 |
| Praha – na místě, nejlevnější (před T3) | 1 000 | 1 700 | 2 500 | 3 900 |
| **Vídeň – ATLAS** | 300 | 900 | 2 100 | 4 200 |
| Vídeň – Mazur online (kyvadlo) | 791 | 1 420 | 2 096 | 2 828 |
| Vídeň – Parkplatz C online | 827 | 2 196 | 3 057 | 4 071 |

Týden sedí na nejlevnější online cenu. Víkend (1–3 dny) je podhodnocený 1,4–4×, dlouhé cesty u Prahy naopak nadhodnocené proti online ceně (14 dní +23 %; u testované cesty na 22 dní aplikace počítá 4 400 Kč).

**Návrh:** místo ceny za den použít základ + cenu za další den, např. Praha ≈ 700 + 115 Kč/den, Vídeň (Mazur) ≈ 650 + 160 Kč/den – obojí odvozeno z online cen výše.

### P2 – Jízdenka Praha → Drážďany je podhodnocená (nižší)

Čip `DRS ~330 Kč/os. tam` = meziměstský spoj ~190 Kč + příplatek za mezinárodní spoj ~50 Kč + S-Bahn ~90 Kč. Skutečnost na 27. a 29. 10. (jedna cesta, 1 dospělý):

| Trasa | ATLAS (meziměstská část) | Skutečnost |
|---|---|---|
| Praha → Drážďany | 240 Kč | bus FlixBus 319–339 Kč, RegioJet 369 Kč; vlak ČD/DB 623–647 Kč |
| Praha → Karlovy Vary | 190 Kč | bus FlixBus 139 Kč, RegioJet 159–219 Kč; vlak ČD 225 Kč |
| Praha → Pardubice | 170 Kč | ČD 169–189 Kč, RegioJet 119–139 Kč, Leo Express 149 Kč |

Karlovy Vary a Pardubice sedí. Drážďany vychází o 80–130 Kč na směr levněji než nejlevnější autobus a vlak je 2,6× dražší. S-Bahn na letiště v Drážďanech (aplikace ~90 Kč) odpovídá 3,60 € (sekundární zdroj).

Drobnost v tooltipu u PRG: „Airport Express 100 Kč" – podle pid.cz stojí 200 Kč (jiný zdroj uvádí 100 Kč, neověřeno).

### P3 – Porto Novo → Abeokuta: 210 km, Google Mapy 150 km (nižší)

Aplikace: `210 km · ~3 h 55 min autem (podle trasy)`. Google Mapy (měřeno v route7, středa 10:00): 150 km, typicky 3 h 20 (3 h 10 – 3 h 30), alternativa 163 km. Vzdálenost je o 40 % delší, čas o 15–25 %. Router zřejmě volí jiný hraniční přechod. Ostatní úseky sedí:

| Úsek | ATLAS autem | Google Mapy (route7) | ATLAS busem |
|---|---|---|---|
| Lagos → Porto Novo | 126 km · ~3 h 25 | 117 km · 2 h 30 – 3 h 40 | ~6 h 10 |
| Lagos → Cotonou | 133 km · ~3 h 25 | 128 km · 2 h 50 – 4 h 10 | ~6 h 15 |
| Cotonou → Porto Novo | 40 km · ~50 min | neměřeno | ~1 h 30 |
| Porto Novo → Abeokuta | 210 km · ~3 h 55 | 150 km · ~3 h 20 | ~6 h 50 |

### Drobnosti

- **D1 – Trip.com:** odkaz (`searchWord=Cotonou, Benin`) vyplní město, data (7.–8. 11.) i „1 room, 2 adults", ale ukáže **0 properties**, dokud uživatel nepotvrdí hledání. Popisek „potvrď Hledat" to říká. S `cityId` (Cotonou = 3251) by výsledky byly hned.
- **D2 – Agoda:** odkaz vede na `agoda.com/cs-cz/` bez místa i dat (popisek „zadej místo a data" je poctivý). Aspoň město by předvyplnila stránka `agoda.com/city/cotonou-bj.html`.
- **D3 – Google Hotels:** předvyplní jen město; data zůstanou výchozí (25.–26. 10.), popisek „zadej data" sedí. Data a hosty umí parametr `ts` (generátor v `research/route7.md`).
- **D4 – upozornění na dlouhý přejezd je dvakrát:** jednou přímo u přejezdu („⚠️ Dlouhý přejezd – zvaž místo mezi nimi.") a znovu jako žlutá poznámka pod seznamem.
- **D5 – čistý profil nemá „Odkud":** místně se Praha sama nenastaví (hlavička „Nastav, odkud létáš", čipy letišť prázdné, hledání se nespustí). Na živém webu v 6. kole byla Praha +200 km vyplněná – stojí za ověření po nasazení.
- **D6 – nadpis režimu u Kataru:** „🛂 Vízum při příletu na hranici" (dvojí určení místa); stačilo by „Vízum při příletu".

## Co jsem ověřil – po bodech

### a) Plán cesty – trasa po víc místech

Let Praha → Lagos, přesná data 20. 10. – 10. 11. 2026 (bral jsem „na ~3 týdny" jako délku cesty). Kiwi 75 nálezů za 11 s, 10 letů tam / 9 zpět; nejlevnější 17 952 Kč/os. (3 přestupy, přílet 22. 10.). Průvodce: „Lagos · 22.10.–10.11. · 19 nocí · 2 os."

- **Automatický návrh** („Víc míst"): Lagos (15 nocí) → Abeokuta (2) → Ibadan (2), poznámka „Na 4 místa jsem v rozumné vzdálenosti nenašel dost vhodných měst – navrhuji 3", tipy „+ Porto Novo", „+ Cotonou".
- **Ruční sestavení:** odebral jsem Abeokutu a Ibadan, přidal „Porto-Novo" (našeptávač: „Porto Novo · Département de l'Ouémé, Benin") a „Abeokuta" (4 návrhy, první Ogun State, Nigérie). Trasa Lagos (17) → Porto Novo (1) → Abeokuta (1), „✓ Všech 19 nocí rozděleno mezi 3 místa".
- **Časy:** autem `126 km · ~3 h 25 min autem (podle trasy; 🚌 autobusem / minibusem ~6 h 10 min)` a `210 km · ~3 h 55 min autem (… ~6 h 50 min)`. Po přepnutí na veřejnou dopravu `🚌 ~6 h 10 min autobusem / minibusem (odhad; autem ~3 h 25 min)`.
- **Slovo „vlak" se v kroku Trasa nikde neobjevilo** – ani v přejezdech, ani u příletu a odletu, ani na přepínači (ten má „🚗 Autem" / „🚌 Autobusem").
- **Hranice:** u obou přejezdů „🛂 přechod hranice Nigérie → Benin – počítej s kontrolou a vízem (Benin: e-vízum) · podmínky vstupu ›" a „… Benin → Nigérie … (Nigérie: e-vízum)". V režimu autem navíc poznámka o půjčeném autě přes hranici.
- **Cotonou ručně:** na 1300×900 zadáno „Cotonou" (návrhy „Cotonou · Littoral, Benin" a „Cotonou Airport"), na 390×844 česky „Kotonu" – našeptávač vrátil „Cotonou · Littoral, Benin". Místo se samo zařadilo mezi Lagos a Porto Novo: Lagos (16) → Cotonou (1) → Porto Novo (1) → Abeokuta (1), přejezd Lagos → Cotonou má hraniční upozornění, Cotonou → Porto Novo (40 km, ~50 min) ne.
- Mapa trasy, tlačítka nocí, pořadí a odebrání fungují; „Pokračovat k ubytování →" je aktivní.

### b) Ubytování na trase

„🏨 Ubytování na trase · 4 místa · 19 nocí · 2 hosté", čtyři záložky. U každého místa informace, že přímé nabídky nejsou zapnuté, a **9 odkazů** se správným městem a daty daného místa (Lagos 22. 10. – 7. 11., Cotonou 7.–8. 11., Porto Novo 8.–9. 11., Abeokuta 9.–10. 11.). Hláška „chybí město nebo země" se neobjevila nikde.

Co se skutečně předvyplnilo (Cotonou, 7.–8. 11. 2026, 2 dospělí; každý odkaz otevřen v Chromu):

| # | Partner | Výsledek | Místo | Data | Hosté |
|---|---|---|---|---|---|
| 1 | Booking.com (hodnocení 8+, od nejlevnějšího) | 87 ubytování | ✅ Cotonou | ✅ so 7. – ne 8. listopadu | 2 v adrese, na stránce nečteno |
| 2 | Booking.com (nejlepší poměr) | 285 ubytování | ✅ | ✅ | 2 v adrese, na stránce nečteno |
| 3 | Airbnb | přes 1000 domovů | ✅ „Domovy v destinaci Cotonou" | ✅ 7.–8. 11. | ✅ 2 hosté |
| 4 | Trip.com | 0, dokud se nepotvrdí hledání (D1) | ✅ „Cotonou, Benin" | ✅ Sat, Nov 7 – Sun, Nov 8 | ✅ 1 room, 2 adults |
| 5 | **Hotels.com** | 64 ubytování | ✅ „Cotonou, Littoral, Benin" | ✅ Sat, Nov 7 – Sun, Nov 8 | ✅ 2 travelers, 1 room |
| 6 | **Kayak** | **úvodní stránka (B1)** | ❌ | ❌ | ❌ |
| 7 | Google Hotels | 226 výsledků | ✅ | ❌ výchozí 25.–26. 10. | výchozí 2 |
| 8 | Hostelworld | městská stránka, 2 hostely | ✅ „Cotonou, Benin" | ❌ výchozí 7.–10. 10. | výchozí 2 |
| 9 | Agoda | úvodní stránka (D2) | ❌ | ❌ | výchozí 2 |

Hostelworld a Kayak jsem otevřel u všech čtyř míst: městské stránky Hostelworldu existují pro všechna (Lagos, Cotonou, Porto-Novo, Abeokuta, HTTP 200), Kayak skončí na `/stays` u všech.

### c) Lety – čipy letišť a doprava na letiště

Odkud „Praha" (první návrh, letiště PRG) + 200 km.

- **Veřejnou dopravou:** `PRG Praha ~50 Kč/os. tam`, `KLV Karlovy Vary 96 km ~220 Kč/os. tam`, `PED Pardubice 106 km ~200 Kč/os. tam`, `DRS Drážďany 120 km ~330 Kč/os. tam`, `JCL České Budějovice 129 km ~230 Kč/os. tam`. Tooltip má rozpad, např. „Praha → Karlovy Vary vlakem / busem ~190 Kč + MHD Karlovy Vary ~30 Kč = ~220 Kč na osobu jedním směrem (zpět totéž), ~2 h 25 min. Odhad podle vzdálenosti a ceníků dopravců, ne jízdní řád."
- **Další možnosti → „Na letiště: 🚗 autem":** objeví se pole „2,6 Kč/km za auto" s vysvětlením (palivo tam i zpět + parkování podle délky cesty + dálniční známky, děleno počtem cestujících). Čipy: `PRG ~840 Kč/os. vč. parkování na 8 dní`, `KLV ~760`, `PED ~700`, `DRS ~1 210`, `JCL ~730`. Tooltip: „Autem 16 km (~40 min): palivo tam i zpět 32 km × 2,6 Kč = ~84 Kč + parkování ~200 Kč/den × 8 dní = ~1 600 Kč = ~1 684 Kč za auto, na osobu (2 os.) ~842 Kč."
- **Výsledky:** „20 194 Kč na osobu · letenky 17 952 Kč + **autem na letiště a zpět 2 242 Kč/os.**", tooltip „palivo ~42 Kč/os. + parkování na 22 dní ~2 200 Kč/os. (2,6 Kč/km, 2 os. v autě) – odhad". Filtr letišť: `PRG 🚗+2240`, `KLV 🚗+1460`, `PED 🚗+1400`, `DRS 🚗+2610`, `JCL 🚗+1290`, `✈︎ MUC 🚗+5280`, `✈︎ VIE 🚗+4490` (u Vídně v rozpadu i dálniční známka Rakousko). Počty sedí.
- Srovnání s realitou je v P1 a P2. Při startu server vypsal „Ceny PHM: nafta 50,65 Kč/l · ČSÚ, 40. týden 2026".

### d) Země

- **Katar:** karta „🛂 vízum na hranici"; detail „Vízum při příletu", max. pobyt 90 dní, poznámka „Vízum při příletu zdarma: 30 dní (1 vstup) nebo 90 dní (více vstupů)" ✅
- **Bělorusko:** „Bez víza – jen s cestovním pasem", 30 dní, „Bez víza 30 dní přes letiště Minsk, po zemi do 31. 12. 2026; nutný pas, pojištění min. 10 000 EUR", doporučené očkování „hepatitida A a B, klíšťová encefalitida" ✅
- **Slovinsko:** „EU / Schengen – volný pohyb, stačí občanský průkaz", poznámka „Ubytování se musí do 72 hodin od vstupu nahlásit na policii (hotely a kempy to řeší samy). Pobyt nad 3 měsíce vyžaduje registraci." ✅

### e) Technické kontroly

| | 1300×900 | 390×844 |
|---|---|---|
| pageerror | 0 | 0 |
| chyby v konzoli | 0 | 0 |
| HTTP ≥ 400 | 0 | 0 |
| requestfailed | 1× `POST /api/search` ERR_ABORTED | 1× totéž |
| vodorovné přetečení | ne | ne |

Přetečení kontrolováno šířkou dokumentu i hledáním viditelných prvků za pravým okrajem, na 390 px ve všech krocích (čipy, výsledky, trasa, ubytování, detail země). Záložky míst a pruh kroků se na mobilu posouvají vodorovně uvnitř svého pásu.

## Zdroje skutečných cen

Jízdenky a parkování dohledal pomocný agent 6. 10. 2026 (ČD e-shop, API RegioJetu a FlixBusu, aeroparking.cz a booking.prg.aero, ceník a e-shop letiště Vídeň); podrobnosti a adresy jsou v `%TEMP%\atlas-qa\round7\reality.md`. Neověřeno zůstalo: nejlevnější vlaková cena DB do Drážďan (bahn.de blokoval dotazy), cena Airport Expressu (200 vs. 100 Kč) a S-Bahn v Drážďanech (jen sekundární zdroj). Online ceny parkování jsou dynamické.
