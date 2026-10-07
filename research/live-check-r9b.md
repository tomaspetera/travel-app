# Živá kontrola – kolo 9b: doprava z letiště do města, hlídání cen, start aplikace na ploše

- **Web:** https://atlas-letenky.onrender.com (doprava z letiště `dcbe5e8`; úvodní obrazovka `<div id="launch"` na webu je)
- **Kdy:** 7. 10. 2026, skutečný Chrome (playwright-core, `channel: 'chrome'`, čistý profil, cs-CZ)
- **Běhy:** A–D na desktopu 1300×900 i mobilu 390×844; E v okně aplikace Chromu (16 startů) a v běžné kartě
- **Kód aplikace nebyl měněn.** Skripty, JSON a všechny snímky jsou na PC v `%TEMP%\atlas-qa\live9\`, výběr snímků ve složce `live-check-r9b/`.

## Shrnutí

Všechny body A–E fungují. Žádná chyba JavaScriptu, žádná odpověď 4xx/5xx, žádné vodorovné přetečení na 1300 ani 390 px. Součty cen sedí na korunu u všech kontrolovaných nabídek.

Našel jsem **1 odchylku od zadání** (pojistka úvodní obrazovky zabere při nedostupném API asi 4,0 s místo 3,5 s – N1) a 5 drobností (N2–N6).

**Důležité omezení bodu E:** aplikaci jsem neinstaloval přes ikonu „Instalovat“. Instalace by na Peterově PC vytvořila zástupce, proto jsem použil okno aplikace Chromu (`chrome --app=…`) s vlastním dočasným profilem. Stránka se v něm hlásí jako `display-mode: standalone`, takže úvodní obrazovka běží stejnou cestou. Neověřil jsem tím systémovou úvodní obrazovku Windows ani ikonu na ploše.

## Tabulka bodů

| # | Bod | Výsledek | Poznámka |
|---|-----|----------|----------|
| A1 | Volba „vč. cesty z letiště do města“, výchozí zapnuto | ✅ | V Dalších možnostech, zaškrtnutá, s nápovědou o vzdálených letištích. |
| A2 | Praha → Paříž, přesná data: štítky | ✅ | „🚌 z letiště BVA do Paříže 17,90 € (~440 Kč) · 1 h 15“, „🚆 z letiště CDG do Paříže 14 € (~340 Kč) · 35 min“, „🚌 zpět na letiště BVA …“. |
| A3 | Bublina: zdroj a datum ověření | ✅ | Např. „Zdroj: aeroportparisbeauvais.com, ověřeno 7. 10. 2026“ + poznámka („Online; na místě 18 €“). |
| A4 | Zvýraznění nad 350 Kč nebo 60 min | ✅ | Zvýrazněné: BVA 440 Kč / 1 h 15, CRL 370 Kč, HHN 460 Kč / 2 h 10, TRF 630 Kč / 1 h 35, SAW 1 h 30, IAD 1 h 05, NRT 370 Kč. Nezvýrazněné např. CDG 340 Kč / 35 min. |
| A5 | Rozpis ceny a součet | ✅ | „letenky 5 711 Kč + doprava na letiště a zpět 100 Kč/os. + z letiště do města a zpět ~780 Kč/os.“ = 6 591 Kč. Rozdíl 0 Kč u všech 12 + 40 + 7×30 kontrolovaných nabídek. |
| A6 | Vypnutí volby | ✅ | Cena klesne přesně o částku (6 591 → 5 811, 6 800 → 5 920). Štítky zůstanou, v bublině „Do ceny nabídky se nepočítá (vypnuto v Další možnosti)“. Shrnutí voleb: „bez cesty z letiště do města“. |
| A7 | „Kamkoli“ | ✅ | 149 ze 150 cílů má štítek; jediný bez štítku je Vídeň (N4). |
| A8 | Charleroi, Londýn, Torp, Barcelona, Řím | ✅ | Tabulka níže. |
| A9 | Antalya, Hurghada = „(odhad)“ | ✅ | „🚌 z letiště AYT do centra ~60 Kč · 40 min (odhad)“; totéž HRG, SSH, RMF. Poznámka N3. |
| A10 | Nejbližší dny, veřejnou dopravou | ✅ | „…vč. dopravy na letiště i z letiště do města“. Tam 4 283 + Zpět 2 308 = 6 591 = cena cesty. |
| A11 | Nejbližší dny, autem | ✅ | „cena dne v Kč/os. (let + cesta autem + z letiště do města) … Tam + Zpět = cena celé cesty“. Tam 3 435 + Zpět 1 108 = 4 543 = nejlevnější cesta. |
| A12 | Cesta přes víc měst | ✅ | Praha → Paříž → Barcelona → Praha: štítek u každého letu, v Praze žádný. 440 + 440 + 180 + 180 = „z letišť do měst a zpět ~1 240 Kč/os.“ |
| B1 | Krok s letem: řádky z/na letiště | ✅ | „🚆 Z letiště CDG → Paříž · vlak RER B do centra (Gare du Nord, Châtelet) · ~35 min · 14 € (~340 Kč)/os.“ a „🚌 Paříž → letiště BVA · autobus Aérobus · ~1 h 15 min · 17,90 € (~440 Kč)/os.“ |
| B2 | Souhrn: položka | ✅ | „🚆 Doprava z letiště do města a zpět (odhad) 1 560 Kč“ (2 os.), celkem 13 182 Kč. Řádky jsou i v Průběhu cesty. |
| B3 | Auto půjčené na letišti příletu | ✅ | Vyzvednutí CDG, vrácení BVA → položka zmizí, celkem 13 182 − 1 560 + 3 000 = 14 622 Kč. V Průběhu cesty jsou místo jízd „Vyzvednutí auta CDG“ a „Vrácení auta BVA“. Drobnost N5. |
| B4 | Sdílený odkaz v novém profilu | ✅ | Stejné řádky i stejná položka 1 560 Kč, text shrnutí shodný, bez chyb v konzoli. Odkaz má 4 752 znaků. |
| C | Hlídání ceny dvakrát | ✅ | 1. klik: „Hledání uloženo…“. 2. klik: „Tohle hledání už hlídáš na Přehledu – cena teď 2 391 Kč/os.“ a v seznamu je jedna položka. V panelu „Je to dobrá cena?“ je tlačítko vypnuté s textem „✓ Tohle hledání už hlídáš“. |
| D | Mobil 390 px | ✅ | Štítky se zalamují uvnitř karty, nic nepřetéká (0 nálezů ve všech 17 krocích). |
| E1 | Úvodní obrazovka v okně aplikace | ✅ | Tmavá obrazovka `#080c1a` s ikonou a nápisem ATLAS, pak jedno prolnutí (0,4 s) do hotového přehledu. |
| E2 | Opakované starty | ✅ | 16 startů, žádný polotovar ani poskakování po zmizení (posun rozvržení po zmizení = 0 ve všech startech). |
| E3 | Nezůstane viset | ⚠️ | Nezůstala nikdy. S nedostupným API ale začne mizet v 3,99 s a zmizí v 4,35 s od začátku načítání – N1. |
| E4 | Světlý i tmavý režim | ✅ | Ve světlém režimu se tmavá obrazovka prolne do světlého přehledu, bez probliknutí. |
| E5 | Offline | ✅ | Naběhne z cache, obrazovka zmizí za 0,65–1,0 s. Drobnost N2. |
| E6 | Běžná karta prohlížeče | ✅ | `#launch` má `display: none`, obrazovka se neukáže. |

## A) Ověřené jízdné u vybraných letišť

| Letiště | Štítek | Zdroj v bublině |
|---|---|---|
| CRL Brusel | 🚌 od 14,99 € (~370 Kč) · 55 min ⚠ | flibco.com – „Online předem; za den odjezdu bývá kolem 19 €“ |
| STN Londýn | 🚆 od 9,90 £ (~280 Kč) · 48 min | stanstedexpress.com – „jinak až 25 £; autobusy National Express od 7 £“ |
| LTN Londýn | 🚆 od 10 £ (~290 Kč) · 32 min | – |
| TRF Oslo | 🚌 od 279 NOK (~630 Kč) · 1 h 35 ⚠ | en.torpekspressen.no |
| OSL Oslo | 🚆 129 NOK (~290 Kč) · 23 min | visitoslo.com – označeno „Zdroj (sekundární, oficiální neuvádí)“ |
| BCN Barcelona | 🚌 7,45 € (~180 Kč) · 35 min | aerobusbarcelona.es |
| FCO Řím | 🚆 14 € (~340 Kč) · 32 min | trenitalia.com |
| CIA Řím | 🚌 6 € (~150 Kč) · 40 min | sitbusshuttle.com |
| AYT, HRG, SSH, RMF | 🚌 ~60 Kč · 40 min (odhad) | „podle vzdálenosti letiště od města (~15 km) a cenové hladiny země, spoj si ověř“ |

Přepočty sedí s kurzem v datech (14 € × 24,405 = 342 → ~340 Kč; 17,90 € → 437 → ~440 Kč).
Samotné ceny u dopravců jsem na jejich webech neověřoval – kontroloval jsem, že aplikace ukazuje zdroj, datum a že s nimi správně počítá.

## E) Úvodní obrazovka – naměřené časy

Čas v ms od začátku načítání stránky. „Mizí“ = přidána třída `out`, „pryč“ = neprůhlednost 0.

| Start | Viditelná od | Přehled hotový | Mizí | Pryč | Posun rozvržení po zmizení |
|---|---|---|---|---|---|
| tmavý, 1. start (prázdná cache) | 206 | 206 | 483 | 849 | 0 |
| tmavý, 2.–5. start | 82–101 | 249–339 | 367–454 | 768–841 | 0 |
| světlý, 3 starty | 81–97 | 258–317 | 403–481 | 781–857 | 0 |
| s nastaveným „Odkud“ (radar cen), 3 starty | 87–3 623 | 245–3 781 | 304–3 959 | 707–4 351 | 0 |
| světlý, offline | 57 | 189 | 279 | 652 | 0 |
| tmavý, offline | 94 | 457 | 552 | 1 014 | 0 |
| tmavý, API neodpovídá | 91 | – | **3 990** | **4 348** | 0 |
| běžná karta | nezobrazí se | 279 | – | – | – |

Jeden ze startů s nastaveným „Odkud“ trval déle, protože server vrátil stránku až po 3,6 s (viz N6); samotná úvodní obrazovka pak zmizela za 0,7 s.

## Nálezy

### N1 – Pojistka úvodní obrazovky: 4,0 s místo 3,5 s (odchylka od zadání)
- **Postup:** okno aplikace, všechny požadavky `/api/**` nechat bez odpovědi, obnovit.
- **Co se stalo:** obrazovka začala mizet v 3 990 ms a zmizela v 4 348 ms od začátku načítání. Časovač `setTimeout(launchDone, 3500)` se totiž spouští až při běhu `app.js` (asi 0,5 s po začátku) a pak ještě 0,4 s trvá prolnutí.
- **Návrh:** časovač zkrátit na ~2 600 ms, nebo ho spustit malým skriptem hned v `<head>`. Záložní CSS animace (`launch-off` po 6 s) funguje nezávisle.

### N2 – Offline: obsah se během prolínání posune (drobnost)
- Při startu offline se při mizení úvodní obrazovky objeví pruh „Jsi offline…“ a posune stránku (posun rozvržení 0,18 v čase, kdy má obrazovka ještě ~70 % neprůhlednosti). Po zmizení už se nic nehýbe. Okem to skoro není vidět.
- **Návrh:** pruh vložit před `launchDone()`, nebo mu vyhradit místo.

### N3 – Odhad uvádí u všech letišť „~15 km“ (k ověření)
- AYT, HRG, SSH i RMF mají stejný text „podle vzdálenosti letiště od města (~15 km)“ a stejný výsledek ~60 Kč / 40 min. U letiště Marsa Alam (RMF) je to podle mě výrazně dál (desítky km), takže odhad bude podhodnocený. Vzdálenost jsem neměřil.
- Odhad mají i některá velká letiště s běžným spojem, např. Kodaň CPH („~150 Kč · 40 min“), Vilnius VNO, Toulouse TLS, Bari BRI, Catania CTA – kandidáti na doplnění do tabulky.

### N4 – Vídeň jako cíl nemá štítek (drobnost)
- V hledání „kamkoli“ z Prahy je jedinou nabídkou bez štítku PRG → VIE. Nejspíš proto, že VIE patří mezi letiště v okolí domova. Pro cestu *do* Vídně by ale štítek (S-Bahn / CAT) dával smysl.

### N5 – Krok s letem ukazuje jízdné i po půjčení auta na letišti (drobnost)
- **Postup:** cesta do Paříže → krok Auto → uložit auto (vyzvednutí CDG, vrácení BVA) → krok Let.
- **Co se stalo:** souhrn správně položku vynechá, ale krok Let dál píše „+ z letiště do města a zpět ~780 Kč/os.“ a oba řádky z/na letiště.
- **Návrh:** v kroku Let u nahrazených úseků dopsat „(nahrazeno půjčeným autem)“ nebo je skrýt.

### N6 – Pomalá odpověď serveru zdrží start aplikace (jen informace)
- V 1 ze 16 startů přišla stránka až po 3,6 s. Service worker bere stránku nejdřív ze sítě, takže do té doby okno nic nevykreslí – úvodní obrazovka je součást té stránky. V nainstalované aplikaci tu dobu kryje systémová úvodní obrazovka; tu jsem ale neověřoval.

### Poznámky
- Položka v souhrnu se jmenuje „Doprava z letiště do města a zpět **(odhad)**“ i tehdy, když je jízdné z ověřené tabulky (Paříž). Odpovídá to zadání, jen to může působit méně jistě, než to je.
- U každého hledání je dál jeden přerušený požadavek `/api/search` (`ERR_ABORTED`) – bez vlivu na výsledky, stejně jako v kole 7.

## Co je na snímcích

| Snímek | Co ukazuje |
|---|---|
| `r9b-desktop-A0-option.png` | Volba v Dalších možnostech |
| `r9b-desktop-A1-paris-on.png`, `…-off.png` | Paříž se zapnutou a vypnutou volbou, Nejbližší dny |
| `r9b-mobile-A1-paris-on.png` | Štítek a rozpis ceny na mobilu |
| `r9b-desktop-A3-Oslo.png`, `…-Hurghada.png` | Torp se zvýrazněním, odhad |
| `r9b-desktop-A4-nearby-car.png` | Nejbližší dny autem |
| `r9b-desktop-A5-multi-result.png` | Cesta přes víc měst |
| `r9b-desktop-B1-flight-step.png`, `…-B2-summary.png`, `…-B4b-with-car.png`, `…-B3-shared-flight.png` | Plánovač cesty |
| `r9b-mobile-B2-summary.png` | Shrnutí na mobilu |
| `r9b-desktop-C-watch.png` | Hlídání ceny podruhé |
| `launch-app-dark-4-a-early.png`, `…-b-fading.png`, `…-c-done.png` | Úvodní obrazovka, prolnutí, hotový přehled |
| `launch-app-light-1-b-fading.png`, `…-c-done.png` | Totéž ve světlém režimu |
| `launch-app-dark-offline-c-done.png` | Start offline |
| `launch-app-dark-api-hang-a-early.png` | Obrazovka při nedostupném API |
| `launch-tab-dark-a-early.png` | Běžná karta – bez úvodní obrazovky |

## Co jsem neověřil

- Skutečnou instalaci přes „Instalovat“, ikonu na ploše a systémovou úvodní obrazovku Windows (viz omezení nahoře).
- Start aplikace na telefonu.
- Správnost jízdného proti webům dopravců.
- Plynulost prolnutí lidským okem – vycházím z měření neprůhlednosti snímek po snímku, z posunů rozvržení a ze snímků.
