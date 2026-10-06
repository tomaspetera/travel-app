# Ověření vstupních podmínek (entry.json) – 6. 10. 2026

Základ: `data/entry.json` na `origin/main` (05aa83e), 197 zemí. Zdrojové stránky (pole `source`, sesterské stránky MZV o dokladech a zdraví a u eta/evisa oficiální web z `etaUrl`) jsem stáhl 6. 10. 2026 jako text a záznamy s nimi porovnal. Soubor `entry.json` jsem nepřepisoval.

## Jak daleko to je

| Způsob kontroly | Zemí |
|---|---|
| Nezávislý agent přečetl celou stránku a porovnal všechna pole | 40 (4 dávky po 10) |
| Ruční kontrola hlavních polí (visa, idCard, maxStayDays, poplatek, pas) podle výpisu ze stránky | 20 (země označené dřív jako sporné) |
| Jen strojové prosetí (skript hledá rozpor u visa, idCard, maxStayDays, etaCostEur) | 132 |
| Stránku se nepodařilo stáhnout | 5 |

**Plné nezávislé ověření tedy má 40 zemí, ruční 20, dalších 132 prošlo jen skriptem a u 5 se stránku nepodařilo stáhnout** – to je slabší kontrola: zachytí jinou délku pobytu nebo jiný vízový režim přímo v textu, ale ne chybu v poznámce, platnosti pasu nebo očkování. Další dávky agentů mi zablokoval systém oprávnění (viz konec).

## Výsledek

- **Navržené změny: 6** (v `entry-verify.json`, každá s přesnou citací ověřenou skriptem proti staženému textu)
- **Bez rozdílu:** 26 zemí po kontrole agentem, 15 po ruční kontrole
- **Nejisté položky: 42** u 31 zemí
- **Neověřitelné: 6** (CM, GA, GQ, PG, PS, UA)

### Navržené změny

- **AF Afghánistán – `maxStayDays`**: 30 → 90
  - citace: „Víza jsou vydávána na dobu pobytu do 3 měsíců.“ (staženo 2026-10-06)
  - zdroj: https://mzv.gov.cz/jnp/cz/encyklopedie_statu/asie/afghanistan/cestovani/visa.html
  - MZV uvádí víza na pobyt do 3 měsíců; 30 dní odpovídá jen e-vízu z Dubaje zmíněnému v poznámce.
- **CO Kolumbie – `etaName`**: "Check-Mig (nepovinný online předregistrační formulář)" → "Check-Mig (online předregistrace, 72 h až 1 h před cestou)"
  - citace: „Pro vstup je oficiálně vyžadováno vyplnění formuláře CheckMig“ (staženo 2026-10-06)
  - zdroj: https://mzv.gov.cz/jnp/cz/encyklopedie_statu/jizni_amerika/kolumbie/cestovani/visa.html
  - MZV formulář uvádí jako oficiálně vyžadovaný a web Migración Colombia ho popisuje jako krok před cestou; označení „nepovinný“ nemá ve stažených oficiálních textech oporu.
- **PK Pákistán – `notes`**: "E-vízum online (1 vstup, až 3 měsíce, 7–10 prac. dní); bezplatné VPA portál od 2026 nenabízí. MZV varuje před cestami do některých oblastí." → "E-vízum online (MZV: vícevstupní na 90 dnů, prodloužení o dalších 90; 7–10 prac. dní); bezplatné VPA portál od 2026 nenabízí. Nad 30 dnů registrace u policie. Některé oblasti nepřístupné."
  - citace: „on-line podání žádosti o vícevstupní vízum na 90 pobytových dnů s možností jeho prodloužení v Pákistánu o dalších 90 dnů“ (staženo 2026-10-06)
  - zdroj: https://mzv.gov.cz/jnp/cz/encyklopedie_statu/asie/pakistan/cestovani/visa.html
  - Poznámka uvádí 1 vstup, ale MZV píše o vícevstupním víze na 90 dnů s prodloužením o dalších 90.
- **SD Súdán – `passportValidity`**: "6 měsíců po vstupu" → "6 měsíců ode dne podání žádosti o vízum"
  - citace: „Pro vstup do Súdánu je vyžadován cestovní pas s dobou platnosti nejméně šest měsíců ode dne požádní žádosti o vízum.“ (staženo 2026-10-06)
  - zdroj: https://mzv.gov.cz/jnp/cz/encyklopedie_statu/afrika/sudan/cestovani/documents.html
  - MZV počítá šestiměsíční platnost pasu od podání žádosti o vízum, ne od vstupu do země.
- **SD Súdán – `notes`**: "MZV varuje před cestami (ozbrojený konflikt). Vízum jen předem na ambasádě Súdánu (Vídeň), 1 vstup; registrace do 3 dnů; s izraelským razítkem vstup nelze." → "MZV varuje před cestami (ozbrojený konflikt). Vízum jen předem na ambasádě Súdánu (Vídeň), 1 vstup; registrace do 7 dní; s izraelským razítkem vstup nelze."
  - citace: „Každý individuální návštěvník Súdánu se musí zaregistrovat v průběhu 7 dní na oddělení cizinecké policie Ministerstva vnitra Súdánu.“ (staženo 2026-10-06)
  - zdroj: https://mzv.gov.cz/jnp/cz/encyklopedie_statu/afrika/sudan/cestovani/visa.html
  - Lhůta pro registraci u cizinecké policie je podle MZV 7 dní, ne 3 dny.
- **YE Jemen – `notes`**: "MZV varuje před všemi cestami (vč. Sokotry). Vízum jen předem na ambasádě, na hranici se nevydává; izraelské razítko v pase může vést k odepření vstupu." → "MZV varuje před všemi cestami (vč. Sokotry). Vízum jen předem na ambasádě, ne na hranici; mimo Sanaá nutné povolení Immigration and Passport Authority; izraelské razítko může vést k odepření vstupu."
  - citace: „Pro cestu či pobyt cizince mimo hlavní město Sanaá je nutné získat povolení od tzv. Immigration and Passport Authority.“ (staženo 2026-10-06)
  - zdroj: https://mzv.gov.cz/jnp/cz/encyklopedie_statu/blizky_vychod/jemen/cestovani/visa.html
  - Text uvádí povinné povolení pro pobyt a cestování mimo Sanaá, které poznámka ani ostatní pole nepokrývají.

### Ověřeno bez rozdílu

- Agentem (26): AE, AM, AO, BA, BB, CA, GB, GH, HU, IE, IS, IT, LI, LT, LU, LV, MT, NL, SB, SG, SM, ST, SZ, TL, TN, US
- Ručně (15): AG, AU, BD, BO, CD, CV, DM, EG, FM, GE, GY, JM, KG, KR, TH

### Co zůstalo nejisté

- **AD Andorra – `idCard`**: MZV uvádí, že v praxi úřady uznávají i OP, ale současně že podle andorrské a české legislativy lze vstoupit jen s pasem; text si v tom odporuje, true je v praxi podporováno jen částečně.
- **AD Andorra – `passportValidity`**: Text MZV o požadované platnosti dokladu mlčí; hodnota 'po dobu pobytu' nelze z textu ověřit.
- **AF Afghánistán – `vaccinesRequired`**: MZV (Doklady): „Očkování není povinné.“ Záznam uvádí podmíněný požadavek na obrnu při pobytu nad 4 týdny – z textu MZV ho nelze potvrdit ani vyvrátit.
- **AL Albánie – `vaccinesRequired`**: MZV: „Pro vstup do Albánie není předepsáno žádné povinné očkování, očkovací průkaz není vyžadován.“ Záznam uvádí podmíněný požadavek (žlutá zimnice při příletu z rizikové země), který obecná věta MZV nevyvrací – ponecháno k posouzení.
- **AO Angola – `vaccinesRequired`**: MZV uvádí jen podmíněně, že při příjezdu ze země s endemickou žlutou zimnicí může být očkovací průkaz vyžadován; tvrzení 'povinná pro všechny od 9 měsíců (WHO/CDC)' text nepotvrzuje.
- **AO Angola – `notes`**: Poznámka zmiňuje e-vízum (evisa.ao) pro jiné účely; text MZV e-vízum nezmiňuje a uvádí, že ostatní víza vystavuje velvyslanectví Angoly v Berlíně.
- **AR Argentina – `passportValidity`**: Text MZV o minimální platnosti pasu mlčí; tvrzení, že se minimální platnost nevyžaduje, nelze z textu ověřit (visa, idCard a maxStayDays jsou potvrzeny).
- **BD Bangladéš – `maxStayDays`**: Délku pobytu 30 dní stránka MZV výslovně neuvádí.
- **CA Kanada – `notes`**: Oficiální web uvádí 'Ebola disease: Temporary measures extended until November 27, 2026', ale text neříká, koho a jak se opatření týkají; poznámka je nezmiňuje. Zmínka o lesních požárech v textu není (nevyvráceno).
- **CD Demokratická republika Kongo – `etaCostEur`**: MZV uvádí jen vízum na ambasádě v Praze; e-vízum a jeho cenu (300 USD) z textu potvrdit nelze.
- **CO Kolumbie – `visa`**: Záznam „none“; podle MZV je Check-Mig oficiálně vyžadován – zvážit, zda nemá být „eta“ (bezplatná povinná předregistrace).
- **DJ Džibutsko – `etaCostEur`**: Strojové prosetí: záznam 21 € (12/23 USD); MZV: „Celkový poplatek za vízum závisí na výši servisního poplatku a může činit i více než 100 USD.“
- **EG Egypt – `vaccinesRequired`**: MZV: „Mezinárodní očkovací průkaz není při vstupu do země vyžadován.“ Záznam uvádí žlutou zimnici při příletu z rizikové země – podmíněný požadavek text nepotvrzuje ani nevyvrací.
- **GB Spojené království – `passportValidity`**: Text (MZV ani gov.uk) o požadované platnosti pasu mlčí; gov.uk uvádí jen, že ETA je vázána na cestovní pas, s nímž se cestuje. Hodnota 'po dobu pobytu' z textu ověřit nelze.
- **GH Ghana – `etaCostEur`**: Text neobsahuje žádnou cenu e-víza (oficiální web jen odkazuje na sekci 'Fees and processing speed' bez čísel), 260 USD tedy ověřit nelze. Ostatní klíčová pole (e-visa, pobyt až 60 dní, 6 měsíců platnost pasu, žlutá zimnice) text potvrzuje.
- **GY Guyana – `etaCostEur`**: Poplatek 25 USD ve staženém textu není; režim (Česko není v seznamu zemí bez víz, vízum při příletu po online žádosti) text potvrzuje.
- **KN Svatý Kryštof a Nevis – `maxStayDays`**: Strojové prosetí: záznam 90, text počet dní neuvádí; poznámka záznamu sama zmiňuje rozpor s MZV (až 6 měsíců).
- **LI Lichtenštejnsko – `maxStayDays`**: MZV uvádí turistický pobyt 90 dnů v průběhu 180 kalendářních dnů bez víza (pobytového povolení), záznam má režim eu a maxStayDays null (poznámka 90/180 obsahuje). Je to otázka konvence pro režim eu, text nic jiného než 90/180 neříká; rozhodnutí ponecháno na posuzovateli.
- **MW Malawi – `maxStayDays`**: Žádná sekce (MZV ani evisa.gov.mw) neuvádí délku povoleného pobytu; hodnotu 30 dnů z textu ověřit nelze.
- **MW Malawi – `notes`**: Oficiální web od 24. 2. 2026 umožňuje vízum při příletu jen 'Category Two Countries' a ČR mezi nimi v textu není jmenována; MZV píše jen, že vízum 'může být v některých případech dostupné i na hraničním přechodu'. Tvrzení 'pro občany ČR' a '30 dní, prodloužení na 90' z textu nevyplývá. Poplatek 50 USD (cca 45 €) a e-visa jako doporučený postup text potvrzuje.
- **MZ Mosambik – `maxStayDays`**: Sekce si odporují: MZV uvádí vízum 'dvouvstupé s platností 30 dní' (hranice), oficiální web e-víza pro turistiku uvádí pobyt 'of 90 days or less'. Záznam má 30; z textu nelze jednoznačně určit.
- **MZ Mosambik – `etaCostEur`**: Text neuvádí žádnou cenu víza ani eVisa (soubor je u oficiálního webu zkrácen); hodnotu 170 € (cca 190 USD) nelze ověřit, poznámka sama říká 'cena neověřena'.
- **NG Nigérie – `visa`**: MZV píše, že o vízum je třeba požádat velvyslanectví Nigérie v Praze, a 'je možné' žádat také on-line (portal.immigration.gov.ng). Text tak nerozlišuje jednoznačně mezi 'visa' a 'evisa'; tvrzení 'při příletu se víza nevydávají' v textu není.
- **NG Nigérie – `maxStayDays`**: Text neuvádí délku povoleného pobytu ani platnost víza; hodnotu 30 dnů nelze ověřit.
- **NG Nigérie – `etaCostEur`**: Text neuvádí žádný poplatek za vízum (288 USD ani jinou částku); hodnotu 257 € nelze ověřit.
- **NG Nigérie – `passportValidity`**: MZV (obě sekce) uvádí platnost pasu alespoň 3 měsíce po předpokládaném odjezdu z Nigérie; údaj NIS o 6 měsících v souboru není (chybí sekce oficiálního webu), záznam proto z textu potvrdit nelze.
- **RS Srbsko – `maxStayDays`**: Stránka MZV délku bezvízového pobytu neuvádí (jen odkaz na web srbského MZV); '90 dní během 6 měsíců' z textu nevyplývá. Bezvízový vstup a platnost OP jsou potvrzeny.
- **RS Srbsko – `passportValidity`**: Text o požadované platnosti pasu/OP nic neříká, nelze ověřit.
- **SB Šalomounovy ostrovy – `notes`**: Poznámka zmiňuje nový e-visa systém od 6. 9. 2026; stránka MZV o něm nic neříká a potvrzuje jen bezvízový vstup s povolením k pobytu na 3 měsíce udělovaným při příletu.
- **SD Súdán – `vaccinesRequired`**: MZV uvádí, že očkovací průkaz není vyžadován, výjimkou je trasa Chartúm–Káhira (žlutá zimnice, požaduje Egypt). Zmínka o britském FCDO v textu není, nelze ověřit.
- **SG Singapur – `visa`**: MZV potvrzuje bezvízový pobyt 90 dní, ale zároveň vyžaduje povinný elektronický Arrival Card před příletem (zdarma); zda to klasifikovat jako 'none' nebo 'eta', text neurčuje. Poznámka kartu uvádí.
- **SM San Marino – `visa`**: Stránka MZV je obecná šablona o volném pohybu v EU a San Marino jako členský stát nijak neuvádí; potvrzuje jen uznání OP i pasu a pobyt do 3 měsíců bez formalit, takže 'none' vs 'eu' z textu nelze rozlišit.
- **SN Senegal – `vaccinesRequired`**: MZV: „Očkování proti žluté zimnici, spalničkám, vzteklině a žloutence A a B není pro Senegal povinné, je pouze doporučeno.“ Záznam uvádí podmíněný požadavek (žlutá zimnice při příletu z rizikové země (od 9 měsíců věku, i tranzit)), který obecná věta MZV nevyvrací – ponecháno k posouzení.
- **SR Surinam – `etaCostEur`**: Jediný zdroj v souboru (MZV, 2 sekce) uvádí poplatek 25 USD nebo 25 EUR (cca 22-25 €), záznam má 50 € a tvrdí, že MZV je zastaralé. Sekce oficiálního webu v souboru chybí, takže 50 € ani 8 € VFS z textu nelze potvrdit ani vyvrátit.
- **SR Surinam – `notes`**: Formulář ICF (icf.sr), poplatek VFS 8 € ani zastaralost údaje MZV text nezmiňuje; text potvrzuje jen bezvízový pobyt do 90 dnů, povinný poplatek Entry Fee online přes VFS a pas platný min. 6 měsíců od prvního vstupu.
- **SV Salvador – `maxStayDays`**: Záznam 180 (poznámka sama říká, že MZV uvádí 90); MZV: „Občané ČR mohou na území státu pobývat po dobu 90 dnů bez víza“ a v rámci C4 se počítá 90 dní celkem.
- **SY Sýrie – `visa`**: Záznam „voa“ (neověřený, podle neoficiálních zdrojů); MZV: „Krátkodobý cestovatel musí zažádat o vízum na Velvyslanectví Syrské arabské republiky v Praze“.
- **SY Sýrie – `maxStayDays`**: Záznam 30; MZV: vízum „je považováno jako vstupní na dobu pobytu 15 dnů“.
- **TJ Tádžikistán – `idCard`**: Stránka MZV neuvádí, jaký doklad je pro vstup nutný (ani zda stačí OP); bezvízový pobyt do 30 dní je potvrzen.
- **TJ Tádžikistán – `passportValidity`**: Text platnost pasu vůbec neuvádí, '6 měsíců po odjezdu' nelze ověřit.
- **TM Turkmenistán – `visa`**: Záznam „evisa“ (neověřený) stojí na novém portálu e-víz; MZV dál píše: „Na občany ČR se vztahuje vízová povinnost, a to i v případě tranzitu přes území Turkmenistánu“ a popisuje vízum na ambasádě s pozváním. Z oficiálního textu e-vízum potvrdit nelze.
- **VC Svatý Vincenc a Grenadiny – `maxStayDays`**: Strojové prosetí: záznam 90; MZV: povolení ke vstupu „platí pro země schengenského prostoru šest (6) měsíců“ (poznámka záznamu rozpor zmiňuje).

### Neověřitelné

- **PS Palestina**: Soubor obsahuje jen rozcestník MZV (menu, seznam států, odkaz na 'Palestinská autonomní území: varování před cestami'); žádný údaj o vízech, ETA-IL, pobytu, pasu ani očkování. Potvrzena je pouze existence varování MZV.
- **CM Kamerun**: Zdrojovou stránku se nepodařilo stáhnout (https://www.evisacam.cm/).
- **GA Gabon**: Zdrojovou stránku se nepodařilo stáhnout (https://evisa.dgdi.ga/).
- **GQ Rovníková Guinea**: Zdrojovou stránku se nepodařilo stáhnout (https://www.equatorialguinea-evisa.com/information).
- **PG Papua-Nová Guinea**: Zdrojovou stránku se nepodařilo stáhnout (https://evisa.ica.gov.pg/evisa/account/Apply).
- **UA Ukrajina**: Zdrojovou stránku se nepodařilo stáhnout (https://mfa.gov.ua/en/consular-affairs/entry-and-stay-foreigners-ukraine/entry-regime-ukraine-foreign-citizens).

### Jen strojově proseté (132)

AT, AZ, BE, BF, BG, BH, BI, BJ, BN, BR, BS, BT, BW, BY, BZ, CF, CG, CH, CI, CL, CN, CR, CU, CY, CZ, DE, DJ, DK, DO, DZ, EC, EE, ER, ES, ET, FI, FJ, FR, GD, GL, GM, GN, GR, GT, GW, HN, HR, HT, ID, IL, IN, IQ, IR, JO, JP, KE, KH, KI, KM, KN, KP, KW, KZ, LA, LB, LC, LK, LR, LS, LY, MA, MC, MD, ME, MG, MH, MK, ML, MM, MN, MR, MU, MV, MX, MY, NA, NE, NI, NO, NP, NR, NZ, OM, PA, PE, PH, PL, PT, PW, PY, QA, RO, RU, RW, SA, SC, SE, SI, SK, SL, SO, SS, TD, TG, TO, TR, TT, TV, TW, TZ, UG, UY, UZ, VC, VE, VN, VU, WS, XK, ZA, ZM, ZW

Skript u nich nenašel v textu jinou délku pobytu ani jiný vízový režim, než má záznam. U 16 zemí text délku pobytu vůbec neuvádí (KE, KN, BH, BT, CI, MM, NA, SL, TG, CG, GW, ML, GM, KI, MH, VC) a u 24 neuvádí poplatek (IL, KN, NZ, AZ, BF, BH, BJ, CI, CU, GN, IN, IQ, LR, MM, NA, RU, SA, SL, TD, TG, ID, KW, RW, LY) – tam záznam stojí na jiném zdroji než na stažené stránce a z ní ho potvrdit nejde.

## Poznámky k metodě

- Citace v `entry-verify.json` jsou přesné podřetězce staženého textu (kontroluje skript). Navržené změny, kde MZV obecně píše „očkování není povinné“, ale záznam má podmíněný požadavek při příletu z rizikové země, jsem přesunul mezi nejisté – obecná věta podmíněné pravidlo nevyvrací.
- MZV při stahování omezuje počet dotazů (HTTP 429); stahovat je potřeba po jedné stránce s pauzou.
- Oficiální weby z `etaUrl` dávají čitelný text jen u 31 z 59 zemí (ostatní jsou aplikace v JavaScriptu), takže poplatky se z nich většinou ověřit nedaly.
- Dříve označené sporné body: Thajsko 30 dní od 15. 9. 2026, Kyrgyzstán 30 dní/60 dní, Korea (výjimka z K-ETA do 31. 12. 2026) a Egypt (vízum 30 USD od 1. 3. 2026) text MZV potvrzuje.

## Proč to není celé

Podle pokynu z cloudu jsem chtěl pustit 20 dávek agentů. Čtyři doběhly, pátou zablokoval klasifikátor oprávnění na tomhle počítači (důvod „Interfere With Workloads“), takže jsem další nepouštěl a zbytek udělal ručně a skriptem. Dávky jsou připravené v `%TEMP%\atlas-qa\entry\verify\in-NN.json` (04–09, 11–14, 16–18, 20) i s pokyny v `INSTRUCTIONS.md`; k dokončení je potřeba, aby Peter spuštění agentů povolil přímo v této relaci.
