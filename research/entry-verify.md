# Ověření vstupních podmínek (entry.json) – 6. 10. 2026

Základ: `data/entry.json` na `origin/main` (05aa83e), 197 zemí. Soubor jsem nepřepisoval – navržené změny jsou v `entry-verify.json`, přehled pokrytí v `entry-verify-coverage.json`.

## Výsledek

| | Zemí |
|---|---|
| Ověřeno bez rozdílu | 131 |
| S navrženou změnou | 14 (14 změn) |
| Jen s nejistou položkou (hlavní pole text nepotvrdil ani nevyvrátil) | 47 |
| Neověřitelné (oficiální text se nepodařilo získat) | 4 |
| Nezkontrolováno | 1 – CL |

Nejistých položek je celkem 168 u 106 zemí (část z nich u zemí, které jsou jinak ověřené).

## Jak se ověřovalo

1. Pro každou zemi jsem 6. 10. 2026 stáhl jako text stránku z pole `source` (u 183 zemí MZV „Víza – režim vstupu“), sesterské stránky MZV „Doklady“ a „Zdravotnictví“ a u eta/evisa oficiální web z `etaUrl`, pokud dává čitelný text.
2. Nezávislý agent přečetl celé texty dávky 10 zemí a porovnal všechna pole záznamu (20 dávek). Šest zemí, kde se zdroj nedal stáhnout, dostal zvláštní agent s prohlížečem.
3. Každou navrženou změnu znovu prošel druhý agent s úkolem ji vyvrátit; změny, které neobstály, jsou níže v oddílu „Zamítnuto protikontrolou“ nebo mezi nejistými.
4. Citace v `entry-verify.json` jsou přesné podřetězce staženého textu – kontroluje to skript. Změna bez dohledané citace mezi změny nepropadne.
5. Dvacet zemí označených při první rešerši jako sporné jsem navíc prošel ručně.

Pravidlo pro očkování: obecná věta MZV „očkování není povinné“ nevyvrací podmíněný požadavek při příletu z rizikové země, takže takové návrhy jsou mezi nejistými, ne mezi změnami.

## Navržené změny (14)

- **BW Botswana – `vaccinesRecommended`**: "hepatitida A a B, tetanus, antimalarika (sever země, delta Okavanga)" → "žlutá zimnice (při cestách na sever země), hepatitida A a B, tetanus, antimalarika (sever země, delta Okavanga)"
  - citace: „Doporučuje se očkování proti žluté zimnici (při cestách na sever země), tetanu a hepatitidě A a B.“ (staženo 2026-10-06)
  - zdroj: https://mzv.gov.cz/jnp/cz/encyklopedie_statu/afrika/botswana/cestovani/health_care.html
  - MZV výslovně doporučuje i očkování proti žluté zimnici při cestách na sever, v záznamu chybí. _(potvrzeno protikontrolou)_
- **BY Bělorusko – `vaccinesRecommended`**: "hepatitida A, klíšťová encefalitida" → "hepatitida A a B, klíšťová encefalitida"
  - citace: „Doporučit lze očkování proti žloutence A i B, milovníkům přírody případně zvážit také očkování proti klíšťové encefalitidě.“ (staženo 2026-10-06)
  - zdroj: https://mzv.gov.cz/jnp/cz/encyklopedie_statu/evropa/belorusko/cestovani/health_care.html
  - MZV doporučuje očkování proti žloutence A i B, v záznamu je jen hepatitida A. _(potvrzeno protikontrolou)_
- **BZ Belize – `vaccinesRecommended`**: "hepatitida A a B, břišní tyfus" → "hepatitida A a B, žlutá zimnice (pralesní oblasti), břišní tyfus"
  - citace: „Očkování není vyžadováno, nicméně při pobytu v pralesních oblastech se doporučuje očkování proti žloutence A i B a proti žluté zimnici.“ (staženo 2026-10-06)
  - zdroj: https://mzv.gov.cz/jnp/cz/encyklopedie_statu/stredni_amerika/belize/cestovani/health_care.html
  - MZV doporučuje v pralesních oblastech i žlutou zimnici; břišní tyfus text neuvádí (ponechán beze změny). _(potvrzeno protikontrolou)_
- **CR Kostarika – `vaccinesRecommended`**: "hepatitida A a B (MZV); ochrana proti komárům (dengue)" → "hepatitida A a B a žlutá zimnice v pralesních oblastech (MZV); ochrana proti komárům (dengue)"
  - citace: „Při pobytu v pralesních oblastech se doporučuje očkování proti žloutence A i B a proti žluté zimnici.“ (staženo 2026-10-06)
  - zdroj: https://mzv.gov.cz/jnp/cz/encyklopedie_statu/stredni_amerika/kostarika/cestovani/health_care.html
  - MZV doporučuje v pralesních oblastech i očkování proti žluté zimnici, v záznamu chybí. _(potvrzeno protikontrolou)_
- **CY Kypr – `notes`**: "V EU, ale mimo Schengen. Legální vstup jen přes Larnaku a Pafos (letiště, přístavy); po příletu přes sever (Ercan) hrozí odepření vstupu na jih." → "V EU, ale mimo Schengen. Legální vstup jen přes letiště Larnaka a Pafos a přístavy Larnaka, Limassol, Pafos a Latsi; po příletu přes sever (Ercan) hrozí odepření vstupu na jih."
  - citace: „Ke vstupu do Kyperské republiky slouží mezinárodní letiště v Larnace a Paphosu nebo přístavy v Larnace, Limassolu, Paphosu a Latsi.“ (staženo 2026-10-06)
  - zdroj: https://mzv.gov.cz/jnp/cz/encyklopedie_statu/evropa/kypr/cestovani/visa.html
  - Poznámka uvádí legální vstup jen přes Larnaku a Pafos, ale MZV uvádí i přístavy Limassol a Latsi. _(upraveno protikontrolou)_
- **EG Egypt – `vaccinesRecommended`**: "hepatitida A a B, břišní tyfus" → "hepatitida A a B, břišní tyfus, meningitida"
  - citace: „dále je doporučeno očkování proti břišnímu tyfu a meningitidě“ (staženo 2026-10-06)
  - zdroj: https://mzv.gov.cz/jnp/cz/encyklopedie_statu/afrika/egypt/cestovani/health_care.html
  - MZV doporučuje kromě hepatitidy a tyfu i očkování proti meningitidě, které záznam neuvádí. _(potvrzeno protikontrolou)_
- **FM Mikronésie – `notes`**: "Bez víza/povolení do 30 dní (delší pobyt: povolení, až +60 dní). Nutná zpáteční letenka, prostředky a formulář CIQ z letadla; odletová taxa cca 20 USD." → "Bez víza do 30 dní, na místě lze prodloužit až na 60 dní. Nutná zpáteční doprava, prostředky a imigrační karta z letadla; odletová taxa 10 USD (Pohnpei, Kosrae) nebo 20 USD (Chuuk)."
  - citace: „Pobyt si lze na místě prodloužit až na 60 dní.“ (staženo 2026-10-06)
  - zdroj: https://mzv.gov.cz/jnp/cz/encyklopedie_statu/australie_a_oceanie/mikronesie/cestovani/visa.html
  - MZV uvádí prodloužení až na 60 dní (ne +60) a odletovou daň 10 USD (Pohnpei, Kosrae) / 20 USD (Chuuk), ne jednotně 20 USD; CIQ text nezmiňuje, jen imigrační kartu. _(potvrzeno protikontrolou)_
- **JO Jordánsko – `notes`**: "MZV: jen nezbytné cesty. Vízum při příletu 40 JOD (~50 EUR), s Jordan Pass (koupě předem, min. 2 noci) zdarma; most King Hussein jen s e-vízem předem." → "MZV: jen nezbytné cesty. Vízum při příletu 40 JOD (~50 EUR), s Jordan Pass (koupě předem, pobyt déle než 3 noci/4 dny) zdarma; most King Hussein jen s e-vízem předem."
  - citace: „V případě, že již máte zakoupený Jordan Pass a že v Jordánsku zůstáváte déle než 3 noci (4 dny), bude Vám odpuštěn vízový poplatek.“ (staženo 2026-10-06)
  - zdroj: https://mzv.gov.cz/jnp/cz/encyklopedie_statu/blizky_vychod/jordansko/cestovani/visa.html
  - MZV uvádí odpuštění poplatku při pobytu déle než 3 noci (4 dny), ne při min. 2 nocích; ostatní části poznámky ponechány beze změny. _(upraveno protikontrolou)_
- **KZ Kazachstán – `notes`**: "Bezvízově 30 dní na jeden vstup, nejvýše 90 dní během 180 dní. Překročení pobytu řeší soud vysokou pokutou – nelze ji zaplatit na letišti a odletět." → "Bezvízově 30 dní na jeden vstup, max. 90 dní během 180 dní. Při příjezdu povinná migrační karta (odevzdá se při odjezdu). Překročení pobytu řeší soud vysokou pokutou – nelze ji zaplatit na letišti."
  - citace: „Při příjezdu/příletu do Kazachstánu je občan povinen vyplnit migrační kartu, kterou odevzdá při opuštění území.“ (staženo 2026-10-06)
  - zdroj: https://mzv.gov.cz/jnp/cz/encyklopedie_statu/asie/kazachstan/cestovani/visa.html
  - Text uvádí povinnou migrační kartu při vstupu, kterou poznámka ani ostatní pole nepokrývají. _(upraveno protikontrolou)_
- **ME Černá Hora – `vaccinesRecommended`**: "hepatitida A" → "hepatitida A a B, tetanus"
  - citace: „Očkování do Černé Hory není třeba, doporučuje se očkování proti žloutence A a B a proti tetanu.“ (staženo 2026-10-06)
  - zdroj: https://mzv.gov.cz/jnp/cz/encyklopedie_statu/evropa/cerna_hora/cestovani/health_care.html
  - MZV doporučuje očkování proti žloutence A a B a proti tetanu, záznam uvádí jen hepatitidu A. _(potvrzeno protikontrolou)_
- **PS Palestina – `passportValidity`**: "6 měsíců po vstupu" → "6 měsíců po plánovaném odjezdu (MZV; PIBA uvádí min. 3 měsíce od příjezdu)"
  - citace: „Při vstupu na území Státu Izrael a Palestinská autonomní území musíte mít strojově čitelný cestovní pas platný minimálně šest měsíců v den předpokládaného opuštění Státu Izrael.“ (staženo 2026-10-06)
  - zdroj: https://mzv.gov.cz/jnp/cz/encyklopedie_statu/blizky_vychod/izrael/cestovani/documents.html
  - MZV výslovně i pro Palestinská autonomní území počítá 6 měsíců ke dni odjezdu, ne od vstupu; oficiální web ETA-IL uvádí jen 3 měsíce od příjezdu (stejné znění jako u záznamu IL). _(potvrzeno protikontrolou)_
- **QA Katar – `visa`**: "none" → "voa"
  - citace: „mohou získat vízum při příletu zdarma“ (staženo 2026-10-06)
  - zdroj: https://mzv.gov.cz/jnp/cz/encyklopedie_statu/blizky_vychod/katar/cestovani/visa.html
  - MZV výslovně uvádí vízum při příletu (visa on arrival) zdarma na 30 dní (1 vstup) nebo 90 dní (více vstupů), ne bezvízový vstup. _(potvrzeno protikontrolou)_
- **SI Slovinsko – `notes`**: "EU a Schengen, volný pohyb osob." → "EU a Schengen, volný pohyb osob. Ubytování se musí do 72 hodin od vstupu nahlásit na policii (hotely a kempy to řeší samy). Pobyt nad 3 měsíce vyžaduje registraci."
  - citace: „V zemi současně platí přihlašovací povinnost ubytování do 72 hodin (do tří dnů – pro občany EU) od doby přechodu slovinské státní hranice“ (staženo 2026-10-06)
  - zdroj: https://mzv.gov.cz/jnp/cz/encyklopedie_statu/evropa/slovinsko/cestovani/visa.html
  - Text uvádí povinné přihlášení ubytování do 72 hodin, které poznámka nezmiňuje. _(potvrzeno protikontrolou)_
- **YE Jemen – `notes`**: "MZV varuje před všemi cestami (vč. Sokotry). Vízum jen předem na ambasádě, na hranici se nevydává; izraelské razítko v pase může vést k odepření vstupu." → "MZV varuje před všemi cestami (vč. Sokotry). Vízum jen předem na ambasádě, ne na hranici; mimo Sanaá nutné povolení Immigration and Passport Authority; izraelské razítko může vést k odepření vstupu."
  - citace: „Pro cestu či pobyt cizince mimo hlavní město Sanaá je nutné získat povolení od tzv. Immigration and Passport Authority.“ (staženo 2026-10-06)
  - zdroj: https://mzv.gov.cz/jnp/cz/encyklopedie_statu/blizky_vychod/jemen/cestovani/visa.html
  - Text uvádí povinné povolení pro pobyt a cestování mimo Sanaá, které poznámka ani ostatní pole nepokrývají. _(potvrzeno protikontrolou)_

## Zamítnuto protikontrolou (4)

- **IR Írán – `vaccinesRequired`** (návrh ""): Obecná věta, že povinné očkování není při vstupu do Íránu požadováno, nevyvrací podmíněný požadavek na žlutou zimnici jen při příletu z rizikové země (cest přímo z ČR se netýká). Záznam se nemění.
- **AL Albánie – `vaccinesRequired`** (návrh ""): Obecná věta, že pro vstup není předepsáno žádné povinné očkování, nevyvrací podmíněný požadavek na žlutou zimnici při příletu z rizikové země. Text se o příjezdech z rizikových oblastí vůbec nevyjadřuje.
- **SN Senegal – `vaccinesRequired`** (návrh ""): Záznam uvádí jen podmíněný požadavek (přílet z rizikové země, i tranzit); obecná věta MZV, že očkování proti žluté zimnici není pro Senegal povinné a průkaz se na hranicích nepředkládá, popisuje běžnou cestu z ČR a příjezd z rizikové země vůbec neřeší. Text tedy podmíněný požadavek nevyvrací a smazání pole nepodporuje.
- **CH Švýcarsko – `maxStayDays`** (návrh 90): Citace v textu je a je přesná, ale záznam má režim „eu“, pro který je maxStayDays podle zadání dat (BRIEF.md: pro „eu“ použij null) záměrně null – stejně jako u všech 31 zemí s volným pohybem včetně LI se shodnou formulací 90/180 a AT, BE, BG z téže dávky s tříměsíční hranicí pro ohlášení. Limit 90 dnů za 180 dnů bez povolení k pobytu už je v poznámce záznamu, takže nejde o chybu, ale o konvenci pole.

## Ověřeno bez rozdílu (131)

AE, AG, AL, AM, AO, AT, AU, BA, BB, BD, BE, BF, BG, BI, BN, BO, BR, BS, CA, CD, CF, CG, CH, CI, CM, CN, CU, DE, DK, DM, EE, ES, FI, FR, GA, GB, GD, GE, GH, GN, GQ, GR, GT, HN, HR, HT, HU, ID, IE, IL, IN, IS, IT, JM, JP, KG, KM, KP, KR, KW, LA, LB, LC, LI, LK, LS, LT, LU, LV, LY, MA, MC, MD, MG, MK, MN, MT, MU, MV, MX, MY, NE, NI, NL, NO, NP, NR, NZ, OM, PA, PE, PG, PH, PL, PT, PW, PY, RO, RW, SA, SB, SC, SE, SG, SK, SM, SN, SS, ST, SZ, TH, TL, TN, TO, TR, TT, TV, TW, UA, UG, US, UY, UZ, VE, VN, VU, WS, XK, ZA, ZM, ZW

## Co zůstalo nejisté (168 položek)

- **AD Andorra**
  - `idCard`: MZV uvádí, že v praxi úřady uznávají i OP, ale současně že podle andorrské a české legislativy lze vstoupit jen s pasem; text si v tom odporuje, true je v praxi podporováno jen částečně.
  - `passportValidity`: Text MZV o požadované platnosti dokladu mlčí; hodnota 'po dobu pobytu' nelze z textu ověřit.
- **AF Afghánistán**
  - `maxStayDays`: Navrženo 90 („Víza jsou vydávána na dobu pobytu do 3 měsíců.“), protikontrola to nepovažuje za jasnou změnu: Stejný návrh jako v out-02.json: obecná nedatovaná věta MZV o všech vízech proti 30 dnům podle novějšího e-víza z 3/2026 v poznámce záznamu. Rozpor má posoudit člověk, nejde o jasnou změnu.
  - `vaccinesRequired`: MZV uvádí 'Očkování není povinné'; záznam zmiňuje možný doklad o očkování proti obrně při odjezdu po pobytu nad 4 týdny, což text neuvádí ani nevyvrací.
- **AO Angola**
  - `notes`: Poznámka zmiňuje e-vízum (evisa.ao) pro jiné účely; text MZV e-vízum nezmiňuje a uvádí, že ostatní víza vystavuje velvyslanectví Angoly v Berlíně.
  - `vaccinesRequired`: MZV uvádí jen podmíněně, že při příjezdu ze země s endemickou žlutou zimnicí může být očkovací průkaz vyžadován; tvrzení 'povinná pro všechny od 9 měsíců (WHO/CDC)' text nepotvrzuje.
- **AR Argentina**
  - `passportValidity`: Text MZV o minimální platnosti pasu mlčí; tvrzení, že se minimální platnost nevyžaduje, nelze z textu ověřit (visa, idCard a maxStayDays jsou potvrzeny).
- **AU Austrálie**
  - `passportValidity`: Text uvádí jen platný cestovní pas; o délce platnosti mlčí.
  - `vaccinesRequired`: MZV: 'není předepsáno žádné povinné očkování, očkovací průkaz není vyžadován' a žlutá zimnice se v zemi nevyskytuje; podmíněný požadavek ze záznamu (pobyt v rizikové zemi do 6 dní) text nepotvrzuje ani výslovně nevyvrací.
  - `visa`: MZV nazývá eVisitor 'vízum' vyřizované online a v Dokladech požaduje 'platné australské vízum'; podle definice by to mohlo být spíš evisa než eta. Text slovo ETA nepoužívá.
- **AZ Ázerbájdžán**
  - `maxStayDays`: Text MZV neuvádí délku pobytu na ASAN e-vízum; 30 dní nelze z textu ověřit.
  - `notes`: Text neobsahuje zavřené pozemní hranice do 2. 1. 2027, vstup jen letecky, 30 dní ani registraci při pobytu nad 15 dní; uvádí jen jednorázové vízum 25 USD.
- **BF Burkina Faso**
  - `etaCostEur`: Text neuvádí výši poplatku za e-vízum (33 000 CFA v textu není); 90 dní a e-visa portál potvrzuje oficiální web.
- **BH Bahrajn**
  - `etaCostEur`: Text MZV ani web evisa.gov.bh neuvádí výši poplatku (10 BHD v textu není).
  - `maxStayDays`: Text neuvádí povolenou délku pobytu (jen že překročení je penalizováno); 14 dní nelze ověřit.
  - `notes`: Text neobsahuje varování kvůli konfliktu s Íránem; zpáteční letenka není povinná, MZV píše jen, že návštěvník může být vyzván k předložení hotelu či zpáteční letenky.
- **BJ Benin**
  - `etaCostEur`: Stránky poplatek neuvádějí (jen odkaz 'Costs of entry visas' bez částky), 50 EUR nelze ověřit.
  - `maxStayDays`: Text uvádí platnost e-víza 30 nebo 90 dní podle volby žadatele, délku pobytu výslovně nestanoví. Záznam má 30 (kratší varianta), nejdelší varianta v textu je 90.
  - `passportValidity`: Text o požadované platnosti pasu mlčí (formulář jen žádá číslo a datum expirace pasu).
  - `vaccinesRequired`: Text uvádí jen 'easing of health control procedures' u kontroly průkazů žluté zimnice, bez data 9/2026 a bez výslovného zrušení kontroly. Stránka MZV v souboru chybí.
- **BR Brazílie**
  - `passportValidity`: Text uvádí jen 6 měsíců od vstupu (MZV ČR); část záznamu 'po celou dobu pobytu (brazilské MZV)' a v notes 'za 180 dnů (QGRV 26. 8. 2026)' v textu není, nelze ověřit.
- **BS Bahamy**
  - `vaccinesRequired`: Sekce se liší: víza/režim vstupu žádá doklad o očkování proti žluté zimnici při cestě z vyjmenovaných zemí, zdravotní sekce říká 'Pro Bahamy není povinné žádné očkování'. Doporučení hepatitidy A text neuvádí.
- **BT Bhútán**
  - `maxStayDays`: Text MZV nestanoví maximální délku pobytu (90 dní se v něm nevyskytuje), zmiňuje jen podání žádosti o prodloužení pobytu v Thimphú.
  - `notes`: Poznámka uvádí děti 6–11 let, text MZV 've věku 6 až 12 let'; údaj 'Pobyt max. 90 dní' text neobsahuje.
- **BW Botswana**
  - `vaccinesRequired`: Text říká jen, že při příjezdu ze země s žlutou zimnicí 'může být vyžadován' očkovací průkaz; zmínka o tranzitu v textu chybí.
- **BY Bělorusko**
  - `notes`: Upozornění MZV na vyzvání k opuštění země není v poskytnutém textu; text navíc uvádí povinné prostředky 24 EUR/den a migrační kartu.
  - `validUntil`: Datum 31. 12. 2026 platí v textu jen pro rozšíření bezvízu na pozemní hranici; bezvízový vstup přes letiště Minsk (30 dní, od 2018) konec nemá. Text zmiňuje i e-vízum (35 EUR + 6 EUR) od 20. 3. 2025.
- **BZ Belize**
  - `notes`: Formulář iDeclare (ideclare.gov.bz) uvedený v notes se v textu nevyskytuje, nelze ověřit.
  - `passportValidity`: MZV potvrzuje 6 měsíců po konci pobytu; údaj 'Belize uvádí min. 30 dní po příletu' v textu není.
- **CA Kanada**
  - `notes`: Oficiální web uvádí 'Ebola disease: Temporary measures extended until November 27, 2026', ale text neříká, koho a jak se opatření týkají; poznámka je nezmiňuje. Zmínka o lesních požárech v textu není (nevyvráceno).
- **CD Demokratická republika Kongo**
  - `etaCostEur`: Text (jen MZV) uvádí vízum nutné obstarat předem na ambasádě v Praze; e-visa RDC a poplatek 300 USD v souboru nejsou a oficiální web chybí, nelze ověřit.
  - `passportValidity`: Text uvádí jen 'platný cestovní pas' bez doby platnosti; 6 měsíců po vstupu nelze ověřit.
- **CG Kongo (republika)**
  - `notes`: K dispozici je jen stránka velvyslanectví Konga v Německu (žádost o vízum, poplatky 110 EUR / 1 měsíc a 155 EUR / 3 měsíce, žlutá zimnice povinná), bez stránky MZV. Tvrzení 'při příletu se nevydává' ani režim pro české občany výslovně v textu nejsou; vízum předem a 3 měsíce (90 dní) jsou ale s textem v souladu.
- **CM Kamerun**
  - `transitEta`: FAQ na evisacam.cm: při přestupu na letišti v Kamerunu probíhá hraniční kontrola a cestující bez osvobození potřebuje tranzitní vízum (nejvýše 30 dní, 153 €). Záznam pole transitEta nemá – ke zvážení, zda ho doplnit.
- **CO Kolumbie**
  - `etaName`: Navrženo "Check-Mig (online předregistrace, 72 h až 1 h před cestou)" („Pro vstup je oficiálně vyžadováno vyplnění formuláře CheckMig“), protikontrola to nepovažuje za jasnou změnu: Poznámka záznamu rozpor výslovně uvádí (dle Migración Colombia nepovinný, MZV vyžaduje) a oficiální web ve staženém textu povinnost nepotvrzuje („permite … precargar“, „Beneficios“). Jde o rozpor MZV vs. oficiální web svázaný s otevřenou otázkou CO.visa none/eta, ne o jasnou změnu.
  - `visa`: Bezvízový pobyt do 90 dnů je potvrzen. MZV ale uvádí 'oficiálně vyžadováno vyplnění formuláře CheckMig', zatímco oficiální web nepovinnost výslovně neuvádí (jen přínosy a vyplnění 72 h předem). Označení 'nepovinný' v etaName/notes tedy text nepotvrzuje; none vs. eta je nejednoznačné. Poplatek 0 text též neuvádí.
- **CR Kostarika**
  - `maxStayDays`: Navrženo 90 („mohou cestovat do Kostariky na dobu do 90 dnů bez víza“), protikontrola to nepovažuje za jasnou změnu: Záznam se vědomě řídí novějším zdrojem a v notes to výslovně uvádí („až 180 dní od 11/2025, délku určí úředník; MZV uvádí 90“), takže rozpor se stránkou MZV je známý a stránka může být jen zastaralá. Z místního textu nelze rozhodnout, který údaj platí – patří to mezi nejisté (rozpor zdrojů), ne mezi změny.
  - `notes`: Tvrzení 'až 180 dní od 11/2025, délku určí úředník' text nepotvrzuje (MZV: 90 dnů, 180 jen za rok); po změně maxStayDays na 90 by notes měly být sladěny.
  - `passportValidity`: MZV potvrzuje 6 měsíců po datu plánovaného odjezdu; údaj 'formálně min. 1 den platnosti (směrnice DGME)' v textu není.
  - `vaccinesRequired`: Text vyjmenovává konkrétní státy (např. Bolívie, Brazílie, Kolumbie, Ekvádor, Peru, Fr. Guyana, Venezuela a africké státy); Trinidad a Tobago ani 'Jižní Amerika' obecně v textu není.
- **CU Kuba**
  - `vaccinesRequired`: Stránky MZV v souboru o očkování (ani o žluté zimnici) vůbec nemluví, takže údaje 'MZV: žádné povinné očkování' a doporučení označená '(MZV)' nelze ověřit.
- **CV Kapverdy**
  - `visa`: MZV 1: bezvízově do 30 dní, taxa 3 400 CVE jde zaplatit online, přes CK i po příletu (předregistrace tedy není jednoznačně povinná, tj. eta nejisté); MZV 2 uvádí 'pas a vízum'; web EASE oznamuje od 1. 1. 2026 vízovou povinnost pro seznam zemí, který v textu chybí (ČR nelze potvrdit ani vyloučit).
- **DJ Džibutsko**
  - `etaCostEur`: MZV píše, že celkový poplatek 'může činit i více než 100 USD' (podle servisního poplatku); sazby 12/23 USD v záznamu text nepotvrzuje a stránka oficiálního webu v souboru chybí.
- **DO Dominikánská republika**
  - `passportValidity`: Navrženo "min. 6 měsíců od návratu ze země" („K cestě postačí platný cestovní pas s minimální platností šest měsíců od návratu ze země.“), protikontrola to nepovažuje za jasnou změnu: Záznam vědomě uvádí časově omezenou výjimku pro občany EU do 31. 12. 2026 a zároveň obecné pravidlo 6 měsíců, které text MZV potvrzuje; MZV o výjimce jen mlčí, výslovně ji nevyvrací. Návrh by vypustil konkrétní datovaný údaj z jiného zdroje, proto jde o nejistotu (rozpor zdrojů), ne o změnu.
- **DZ Alžírsko**
  - `maxStayDays`: Text MZV uvádí jen nutnost víza a platný pas; délka pobytu (90 dní) v textu není.
  - `passportValidity`: MZV uvádí pouze 'Platný cestovní pas'; požadavek 6 měsíců v textu chybí.
- **EC Ekvádor**
  - `notes`: Údaje o Galapágách (TCT, vstup) a o výpisu z rejstříku při vstupu pozemně z Peru/Kolumbie 'dle MZV' v textu nejsou; text naopak uvádí povinné potvrzení o očkování proti žluté zimnici při vstupu z BO/BR/CO/PE, které notes nezmiňují.
  - `vaccinesRecommended`: Tvrzení 'certifikát z 5/2025 zrušen 8/2025, jen doporučení' je v rozporu s textem (opatření na dobu neurčitou); doporučení pro Amazonii, Esmeraldas, hepatitidy, tyfus a malárii text neuvádí.
  - `vaccinesRequired`: Navrženo "žlutá zimnice – potvrzení o očkování (ne starší 10 dnů) při vstupu z Bolívie, Brazílie, Kolumbie a Peru (u cizinců po pobytu tam delším než 10 dnů; nad 60 let se nevyžaduje)" („S platností od 12.5.2025 požaduje Ekvádor po všech cestovatelích vstupujících na území Ekvádoru z Bolívie, Brazílie, Kolumbie a Peru potvrzení o očkování proti žluté zimnici, které nesmí být mladší než 10 dnů.“), protikontrola to nepovažuje za jasnou změnu: Záznam výslovně uvádí, že požadavek certifikátu z 5/2025 byl v 8/2025 zrušen, tedy se vědomě řídí novějším zdrojem a stránka MZV („na dobu neurčitou“) může být zastaralá. Navržený text navíc obrací význam: MZV píše, že potvrzení „nesmí být mladší než 10 dnů“, návrh uvádí „ne starší 10 dnů“.
- **EG Egypt**
  - `vaccinesRequired`: MZV uvádí plošně 'Mezinárodní očkovací průkaz není při vstupu do země vyžadován', záznam má žlutou zimnici při příletu z rizikové země; text rizikové země nezmiňuje, rozpor je nejednoznačný.
- **ER Eritrea**
  - `maxStayDays`: Text zmiňuje jen prodloužení víza 'až dvakrát po 30 dnech'; délka základního pobytu (30 dní) není výslovně uvedena.
  - `passportValidity`: Navrženo "3 měsíce po skončení cesty" („Platný cestovní pas (ještě nejméně tři měsíce po skončení cesty) s uděleným vízem.“), protikontrola to nepovažuje za jasnou změnu: Citát v sekci Doklady doslova sedí a říká tři měsíce, jde ale o starý text z databáze turistických cest a poznámka záznamu obsahuje údaje, které v textu MZV nejsou (50 EUR, až 4 týdny, schvaluje Asmara), takže záznam zjevně čerpá i z jiného zdroje. Zmírnění požadavku ze 6 na 3 měsíce jen podle této věty je rizikové – ponechat k ručnímu ověření u velvyslanectví Eritreje v Berlíně.
  - `vaccinesRequired`: Navrženo "žlutá zimnice – povinná" („Povinné je očkování proti žluté zimnici.“), protikontrola to nepovažuje za jasnou změnu: Věta MZV je obecná, pochází ze staré databáze a neříká, zda povinnost platí i při příletu z Evropy. Pole očkování v této dávce zjevně vycházejí z podrobnějšího zdroje než MZV (podmíněný režim mají i CN, DZ a KP, kde text MZV o povinném očkování mlčí), jde tedy o rozpor zdrojů k ručnímu ověření, ne o jasnou chybu záznamu.
- **ET Etiopie**
  - `visa`: MZV eVisa jen 'doporučuje' a výslovně připouští vízum při příletu (visa on arrival), i když ho nedoporučuje; povinnost eVisa text nestanoví jednoznačně.
- **FJ Fidži**
  - `visa`: MZV: vstupní vízum není třeba žádat před příletem, ale 'na místě po příletu obdrží tzv. návštěvnické vízum' (až 4 měsíce). Záznam má 'none', podle definice by to mohlo být i 'voa'; text nezmiňuje poplatek ani postup, takže nelze jednoznačně rozhodnout.
- **FM Mikronésie**
  - `passportValidity`: MZV (oddíl 1 i 2) uvádí 120 dní po plánovaném odjezdu/pobytu; formulaci 'po vstupu do FSM' stažený text nepotvrzuje.
- **FR Francie**
  - `notes`: Tvrzení o povinné žluté zimnici ve Francouzské Guyaně text stránek nezmiňuje (nelze ověřit); zbytek poznámky je text MZV podložen.
- **GB Spojené království**
  - `passportValidity`: Text (MZV ani gov.uk) o požadované platnosti pasu mlčí; gov.uk uvádí jen, že ETA je vázána na cestovní pas, s nímž se cestuje. Hodnota 'po dobu pobytu' z textu ověřit nelze.
- **GE Gruzie**
  - `passportValidity`: Text uvádí jen platný pas nebo OP; o požadované délce platnosti mlčí.
- **GH Ghana**
  - `etaCostEur`: Text neobsahuje žádnou cenu e-víza (oficiální web jen odkazuje na sekci 'Fees and processing speed' bez čísel), 260 USD tedy ověřit nelze. Ostatní klíčová pole (e-visa, pobyt až 60 dní, 6 měsíců platnost pasu, žlutá zimnice) text potvrzuje.
- **GL Grónsko**
  - `idCard`: MZV píše jen, že cestovat pouze na občanský průkaz 'se nedoporučuje' (platný pas); netvrdí, že OP nestačí. Tvrzení v notes o dánské cizinecké službě a severských průkazech v textu není. Hodnota false je konzervativní, ale text ji přímo nepotvrzuje.
- **GM Gambie**
  - `maxStayDays`: Stránky MZV o délce pobytu (90 dní, razítko na 28 dní, prodloužení) nic neuvádějí; uvádějí jen, že vízová povinnost byla zrušena a že hranice někdy víza chtějí. Hodnotu 90 nelze z textu ověřit.
- **GQ Rovníková Guinea**
  - `maxStayDays`: Oficiální web e-víza ani MZV délku povoleného pobytu neuvádějí (hodnota null tomu odpovídá). Údaj z poznámky „pobyt obvykle 30 dní“ z textu ověřit nelze; jeden vstup, 50 + 25 USD, 72 h a letiště Malabo text potvrzuje.
  - `passportValidity`: Web e-víza si odporuje: stránky Information, FAQ a Arriving uvádějí 6 měsíců / 180 dní od vstupu (odpovídá záznamu), stránka How to Apply jen „at least 30 days from your date of arrival“. MZV uvádí 6 měsíců od data udělení víza.
- **GW Guinea-Bissau**
  - `maxStayDays`: Text MZV délku pobytu (30 dní) neuvádí.
  - `notes`: Text zmiňuje jen vízum na ambasádě v Bruselu; vízum při příletu na letišti Bissau, cena 80 EUR ani miny v textu nejsou.
  - `vaccinesRecommended`: Navrženo "žlutá zimnice, hepatitida A a B, břišní tyfus, meningokoková meningitida, tetanus, obrna; antimalarika" („Očkování proti žluté zimnici není sice při příletu z Evropy povinné, přesto ho Ministerstvo zahraničních věcí ČR doporučuje společně s očkováním proti tetanu, břišnímu tyfu, obrně, meningitidě a žloutence A a B.“), protikontrola to nepovažuje za jasnou změnu: Doporučení MZV v textu skutečně je, ale žlutou zimnici záznam už uvádí silněji jako povinnou a zbytek seznamu se s textem shoduje. Doplnění má smysl jen tehdy, pokud se zruší povinnost ve vaccinesRequired, proto rozhodnout společně s ní.
  - `vaccinesRequired`: Navrženo "" („Očkování proti žluté zimnici není sice při příletu z Evropy povinné, přesto ho Ministerstvo zahraničních věcí ČR doporučuje společně s očkováním proti tetanu, břišnímu tyfu, obrně, meningitidě a žloutence A a B.“), protikontrola to nepovažuje za jasnou změnu: Text říká jen, že očkování není povinné při příletu z Evropy, což nepodporuje prázdnou hodnotu (povinnost při příletu z rizikových zemí tím vyloučena není). Záznam navíc nese údaj „od 1 roku“, který v textu MZV není, tedy vychází z jiného zdroje; zrušit povinné očkování jen podle staré stránky MZV je rizikové – rozpor zdrojů k ručnímu ověření.
- **GY Guyana**
  - `etaCostEur`: Poplatek 25 USD (cca 22 EUR) ani žádná jiná částka se v textu nevyskytuje; nelze ověřit.
  - `maxStayDays`: Soubor obsahuje jen seznam států bez vízové povinnosti (ČR v něm není, vízum je tedy nutné) a formulář ISS s dokladem 'Letter requesting visa on arrival (mandatory)', což voa podporuje; délka pobytu 30 dní v textu není.
  - `passportValidity`: Požadovaná platnost pasu (6 měsíců, 2 volné stránky) v textu není; text uvádí jen povinnou stránku s biodaty pasu.
- **ID Indonésie**
  - `vaccinesRequired`: MZV výslovně uvádí, že potvrzení o očkování proti nakažlivým nemocem není vyžadováno; záznam uvádí podmíněný požadavek (žlutá zimnice při příletu z rizikové země, WHO), který není v textu. Nelze rozhodnout, zda ponechat.
- **IL Izrael**
  - `notes`: Text neobsahuje varování MZV před cestami kvůli konfliktu s Íránem ani údaj PIBA o platnosti pasu (min. 3 měsíce od příjezdu); MZV uvádí jen 6 měsíců v den odjezdu a nedoporučuje cesty do Pásma Gazy.
- **IN Indie**
  - `etaCostEur`: Text (MZV ani web) neuvádí výši poplatku za e-vízum (25 USD / 40 USD / +3 %), nelze ověřit; ostatní pole sedí.
- **IQ Irák**
  - `etaCostEur`: Poplatek za e-vízum (cca 160 USD) v textu není; MZV uvádí jen cca 70 USD za kurdské povolení (poznámka uvádí 100 000 IQD).
  - `maxStayDays`: MZV uvádí 30 dnů jen pro krátkodobé povolení v Kurdistánu (bez vstupu do dalších provincií); délka pobytu na e-vízum do zbytku Iráku v textu chybí.
- **IR Írán**
  - `passportValidity`: Sekce se liší: stránka Víza říká 6 měsíců po vypršení platnosti víza, stránka Doklady 6 měsíců ode dne vstupu do země.
- **JM Jamajka**
  - `passportValidity`: MZV oddíl 2 uvádí pas s min. 6měsíční platností jako požadovaný (záznam říká 'doporučeno'); tvrzení o jamajských úřadech (jen po dobu pobytu) text neobsahuje.
- **JO Jordánsko**
  - `maxStayDays`: Text délku povoleného pobytu (30 dní) neuvádí; zmiňuje jen povinnost registrace u cizinecké policie při pobytu delším než 30 dnů.
  - `vaccinesRequired`: MZV: 'Mezinárodní očkovací průkaz není vyžadován.' Záznam uvádí podmíněný požadavek žluté zimnice podle CDC, který v textu chybí.
- **KE Keňa**
  - `maxStayDays`: Text MZV ani web eTA neuvádí délku turistického pobytu; 90 dní nelze z textu ověřit (uvádí jen, že konečné rozhodnutí je na migrační službě).
  - `notes`: Poplatek 30 USD dle etakenya.go.ke není v textu webu (ten poplatek neuvádí); MZV uvádí 32 USD (rozdíl pod 15 %, změna není nutná).
  - `passportValidity`: Sekce [1] uvádí pas platný 6 měsíců po plánovaném příjezdu s 1 volnou stranou, sekce [2] uvádí platnost o 6 měsíců delší než doba pobytu; formulace se mírně liší.
- **KH Kambodža**
  - `etaCostEur`: 27 EUR odpovídá poplatku 30 USD za vízum po příletu; e-vízum (etaName) stojí podle MZV 37 USD (cca 33 EUR). Není jasné, který poplatek pole znamená, proto nenavrhuji změnu.
  - `notes`: Navrženo "Vízum při příletu 30 USD, e-vízum předem 37 USD (30 + 7 poplatek), obě na 30 dní. Do 7 dnů před příletem povinná e-Arrival (zdarma). Pozemní hranice s Thajskem je uzavřena." („Poplatek za 30 denní turistické vízum je 37 USD (30 USD vízum + 7 USD manipulační poplatek) a je nutno jej uhradit platnou platební kartou.“), protikontrola to nepovažuje za jasnou změnu: MZV sice uvádí 37 USD (30 + 7), ale oficiální web evisa.gov.kh v souboru chybí a stránka MZV je zjevně starší (thajské přechody uvádí jako průchozí, starý poplatek 30 + 7); záznam má e-vízum za 30 USD konzistentně i v etaCostEur (27 EUR), které první agent sám nechal jako nejisté. Změna jen poznámky by záznam učinila vnitřně rozporným – poplatek za e-vízum je nutné ověřit na oficiálním webu.
  - `vaccinesRequired`: MZV: 'od českých občanů není vyžadováno žádné povinné očkování'; záznam uvádí podmíněný požadavek žluté zimnice při příletu z rizikové země, který v textu není.
- **KN Svatý Kryštof a Nevis**
  - `maxStayDays`: Strojové prosetí: záznam 90, text počet dní neuvádí; poznámka záznamu sama zmiňuje rozpor s MZV (až 6 měsíců).
- **KR Jižní Korea**
  - `passportValidity`: MZV oddíl 1: platnost pasu musí být alespoň 6 měsíců; oddíl 2: pas platný po dobu pobytu, 6 měsíců jen doporučeno – texty si odporují.
- **LA Laos**
  - `notes`: MZV: online formulář (immigration.gov.la) je od 1. 9. 2025 povinný na 3 letištích a mostě Lao-Thai Friendship Bridge, ale zároveň píše, že přihlašovací povinnost u turistických víz neplatí – nejednoznačné, zda se formulář týká turistů.
- **LB Libanon**
  - `passportValidity`: Sekce 1 (víza) říká, že pas má být platný 'nejlépe šest měsíců po opuštění země', sekce 2 (doklady) 'min. 6 měsíců při vstupu do země'; záznam uvádí 6 měsíců po odjezdu (doporučeno) – texty si neodpovídají.
- **LC Svatá Lucie**
  - `notes`: Text uvádí jen povinný příjezdový formulář s QR kódem; adresa travelslu.govt.lc, 'zdarma' ani lhůta 72 h v textu nejsou (neodporuje, jen neověřeno).
- **LI Lichtenštejnsko**
  - `maxStayDays`: MZV uvádí turistický pobyt 90 dnů v průběhu 180 kalendářních dnů bez víza (pobytového povolení), záznam má režim eu a maxStayDays null (poznámka 90/180 obsahuje). Je to otázka konvence pro režim eu, text nic jiného než 90/180 neříká; rozhodnutí ponecháno na posuzovateli.
- **LR Libérie**
  - `maxStayDays`: Text nikde neuvádí délku pobytu (30 nebo 90 dní); stránka webu je zkrácena, poznámka o 30/90 dnech podle úředníka nelze ověřit.
  - `passportValidity`: MZV: pas platný ještě 6 měsíců po ukončení cesty a vycestování; oficiální web: platnost alespoň 6 měsíců od data vstupu – sekce se liší, záznam následuje MZV.
- **LS Lesotho**
  - `notes`: Text nezmiňuje, že e-vízum je pozastaveno ani kontakt e-mailem; MZV naopak odkazuje na evisalesotho.com pro delší pobyt. Tvrzení z poznámky nelze z textu ověřit.
- **LY Libye**
  - `etaCostEur`: Text MZV poplatek za e-vízum neuvádí (63 USD / 56 EUR z textu ověřit nelze).
- **MA Maroko**
  - `notes`: Pokyny o 30 km od hranice s Alžírskem a o Západní Sahaře nejsou v textu; ostatní fakta poznámky (90 dní, jen pas) sedí.
  - `passportValidity`: MZV sekce 1 uvádí pas platný nejméně 3 měsíce od vstupu, sekce Doklady uvádí platnost po dobu pobytu a doporučuje mít dostatečnou platnost; sekce si částečně odporují.
- **MD Moldavsko**
  - `vaccinesRecommended`: MZV doporučuje hepatitidu A nebo A+B a navíc vzteklinu při pobytu na venkově, v odlehlých oblastech, na kole či v jeskyních; záznam vzteklinu neuvádí (neodporuje, jen neúplné).
- **MG Madagaskar**
  - `etaCostEur`: MZV uvádí jen vstupní poplatek 10 EUR pro pobyt do 15 dní a žádnou cenu pro delší pobyt; oficiální web evisamada-mg.com má ceny jen jako '-- USD / -- EUR'. Částku 35 EUR (a stupnici 30/35/40 EUR v poznámce) tedy z textu nelze ověřit ani vyvrátit.
- **MK Severní Makedonie**
  - `passportValidity`: Text uvádí jen platný pas nebo OP, žádnou požadovanou délku platnosti; 'po dobu pobytu' z textu nevyplývá.
- **ML Mali**
  - `maxStayDays`: Text uvádí jen 'cestovní pas a vízum'; délka pobytu (90 dní) v textu není.
  - `passportValidity`: Text požadavek 6 měsíců platnosti pasu neuvádí; stránka obsahuje jen větu o pasu a vízu.
- **MM Myanmar (Barma)**
  - `etaCostEur`: Text neuvádí poplatek za eVisa (50 USD), nelze ověřit.
  - `maxStayDays`: Text neuvádí délku pobytu na eVisa (28 dní), nelze ověřit.
- **MR Mauritánie**
  - `maxStayDays`: Web nabízí balíčky 30 / 90 / 360 dní a MZV zmiňuje 90denní víza pro více vstupů; text neříká, jak dlouhý pobyt jednotlivé balíčky umožňují, 30 dní proto nelze potvrdit jako maximum.
- **MU Mauricius**
  - `notes`: Turistický poplatek 3 EUR/noc není v textu; formulář zdarma, zpáteční letenka a doklad o ubytování a prostředcích jsou potvrzeny.
- **MW Malawi**
  - `maxStayDays`: Žádná sekce (MZV ani evisa.gov.mw) neuvádí délku povoleného pobytu; hodnotu 30 dnů z textu ověřit nelze.
  - `notes`: Oficiální web od 24. 2. 2026 umožňuje vízum při příletu jen 'Category Two Countries' a ČR mezi nimi v textu není jmenována; MZV píše jen, že vízum 'může být v některých případech dostupné i na hraničním přechodu'. Tvrzení 'pro občany ČR' a '30 dní, prodloužení na 90' z textu nevyplývá. Poplatek 50 USD (cca 45 €) a e-visa jako doporučený postup text potvrzuje.
- **MZ Mosambik**
  - `etaCostEur`: Text neuvádí žádnou cenu víza ani eVisa (soubor je u oficiálního webu zkrácen); hodnotu 170 € (cca 190 USD) nelze ověřit, poznámka sama říká 'cena neověřena'.
  - `maxStayDays`: Sekce si odporují: MZV uvádí vízum 'dvouvstupé s platností 30 dní' (hranice), oficiální web e-víza pro turistiku uvádí pobyt 'of 90 days or less'. Záznam má 30; z textu nelze jednoznačně určit.
- **NA Namibie**
  - `etaCostEur`: Text neuvádí poplatek (1 600 NAD), nelze ověřit; MZV zmiňuje vízum na letišti Windhoek i online žádost.
  - `maxStayDays`: Text neuvádí maximální délku pobytu (90 dní), nelze ověřit.
- **NG Nigérie**
  - `etaCostEur`: Text neuvádí žádný poplatek za vízum (288 USD ani jinou částku); hodnotu 257 € nelze ověřit.
  - `maxStayDays`: Text neuvádí délku povoleného pobytu ani platnost víza; hodnotu 30 dnů nelze ověřit.
  - `passportValidity`: MZV (obě sekce) uvádí platnost pasu alespoň 3 měsíce po předpokládaném odjezdu z Nigérie; údaj NIS o 6 měsících v souboru není (chybí sekce oficiálního webu), záznam proto z textu potvrdit nelze.
  - `visa`: MZV píše, že o vízum je třeba požádat velvyslanectví Nigérie v Praze, a 'je možné' žádat také on-line (portal.immigration.gov.ng). Text tak nerozlišuje jednoznačně mezi 'visa' a 'evisa'; tvrzení 'při příletu se víza nevydávají' v textu není.
- **NI Nikaragua**
  - `notes`: Text tvrdí, že formuláře se vyplňují na portálu, v letadle nebo na hranici; povinný 7denní předstih platí jen pro zástupce NGO. Doporučení formuláře DGME 7 dní předem pro turisty v textu není.
- **NP Nepál**
  - `etaCostEur`: MZV uvádí poplatek podle délky víza: 30 USD / 15 dní (cca 27 EUR), 50 USD / 30 dní (cca 44,5 EUR), 125 USD / 90 dní (cca 111 EUR). Záznam má 45 EUR (odpovídá 30denní variantě) a zároveň maxStayDays 90 (odpovídá 125 USD) – záleží na zvolené délce víza.
- **NZ Nový Zéland**
  - `notes`: Text neříká, že NZ Traveller Declaration je povinná před příletem ani že je zdarma; MZV jen uvádí, že Arrival Card se od července 2023 postupně nahrazuje touto online deklarací a že registrace probíhá po příletu.
- **PA Panama**
  - `passportValidity`: MZV (víza i doklady) uvádí platnost pasu min. 6 měsíců; údaj o 3 měsících podle úřadů Panamy v textu není a nelze ho ověřit.
- **PH Filipíny**
  - `vaccinesRequired`: Text zmiňuje jen doporučení očkování proti obrně (a spalničkám apod.), povinné očkování proti obrně ani žluté zimnici při příletu z rizikových zemí v textu není.
- **PK Pákistán**
  - `notes`: Navrženo "E-vízum online (MZV: vícevstupní na 90 dnů, prodloužení o dalších 90; 7–10 prac. dní); bezplatné VPA portál od 2026 nenabízí. Nad 30 dnů registrace u policie. Některé oblasti nepřístupné." („on-line podání žádosti o vícevstupní vízum na 90 pobytových dnů s možností jeho prodloužení v Pákistánu o dalších 90 dnů“), protikontrola to nepovažuje za jasnou změnu: Citát MZV popisuje režim Visa Prior to Arrival z 14. 8. 2024 (vícevstupní vízum 90 + 90 dnů), o kterém poznámka záznamu výslovně říká, že jej portál od 2026 nenabízí – záznam tedy vědomě vychází z novějšího zdroje a sekce oficiálního webu počet vstupů ani délku víza neuvádí, takže údaj '1 vstup' text nevyvrací. Navržená poznámka by si navíc odporovala (parametry VPA vedle tvrzení, že VPA není v nabídce); registrační povinnost při pobytu nad 30 dnů text MZV podporuje, ale patří k ručnímu posouzení spolu s aktuálností stránky MZV.
- **PS Palestina**
  - `verified`: Záznam má verified=false. Texty MZV (Izrael a Palestinská autonomní území) a oficiálního webu ETA-IL potvrzují ETA-IL jako povinnou registraci, poplatek 25 ILS, pobyt do 90 dnů, cestovní pas a kontrolu vstupu izraelskými orgány; po úpravě platnosti pasu lze záznam označit za ověřený.
- **PY Paraguay**
  - `passportValidity`: Text neuvádí žádný požadavek na platnost pasu (jen že turista potřebuje pas a vystačí s 90 dny); hodnotu nelze ověřit.
- **QA Katar**
  - `notes`: Poznámka říká 'bez víza (povolení při příletu)', MZV píše 'vízum při příletu zdarma'; varování MZV kvůli konfliktu s Íránem ve staženém textu není, nelze ověřit.
- **RS Srbsko**
  - `maxStayDays`: Stránka MZV délku bezvízového pobytu neuvádí (jen odkaz na web srbského MZV); '90 dní během 6 měsíců' z textu nevyplývá. Bezvízový vstup a platnost OP jsou potvrzeny.
  - `passportValidity`: Text o požadované platnosti pasu/OP nic neříká, nelze ověřit.
- **RU Rusko**
  - `etaCostEur`: Text uvádí, že se platí poplatek, ale jeho výši (cca 52 USD) neuvádí; nelze ověřit.
  - `visa`: Soubor obsahuje jen web e-viza (bez MZV stránky); seznam zemí způsobilých pro e-vízum v textu chybí, takže způsobilost českých občanů nelze potvrdit.
- **SA Saúdská Arábie**
  - `passportValidity`: Soubor neobsahuje stránku MZV Doklady, platnost pasu (6 měsíců po vstupu) v textu chybí.
- **SB Šalomounovy ostrovy**
  - `notes`: Poznámka zmiňuje nový e-visa systém od 6. 9. 2026; stránka MZV o něm nic neříká a potvrzuje jen bezvízový vstup s povolením k pobytu na 3 měsíce udělovaným při příletu.
- **SD Súdán**
  - `notes`: Navrženo "MZV varuje před cestami (ozbrojený konflikt). Vízum jen předem na ambasádě Súdánu (Vídeň), 1 vstup; registrace do 7 dní; s izraelským razítkem vstup nelze." („Každý individuální návštěvník Súdánu se musí zaregistrovat v průběhu 7 dní na oddělení cizinecké policie Ministerstva vnitra Súdánu.“), protikontrola to nepovažuje za jasnou změnu: Text MZV uvádí registraci do 7 dní, záznam ale prokazatelně kombinuje MZV s britským FCDO (viz vaccinesRequired) a přísnější lhůta 3 dny může pocházet odtud; soubor stránky druhý zdroj neobsahuje. Prodloužit lhůtu bez ověření je riskantní (hrozí pokuta) – ponechat jako nejisté.
  - `passportValidity`: Navrženo "6 měsíců ode dne podání žádosti o vízum" („Pro vstup do Súdánu je vyžadován cestovní pas s dobou platnosti nejméně šest měsíců ode dne požádní žádosti o vízum.“), protikontrola to nepovažuje za jasnou změnu: Text MZV opravdu počítá 6 měsíců ode dne podání žádosti o vízum, ale záznam má přísnější podmínku (6 měsíců po vstupu), která znění MZV v sobě zahrnuje, a prokazatelně čerpá i z britského FCDO (viz vaccinesRequired). Zmírnit požadavek jen podle jediné, možná zastaralé stránky MZV je nejisté – ověřit ručně.
  - `vaccinesRequired`: MZV uvádí, že očkovací průkaz není vyžadován, výjimkou je trasa Chartúm–Káhira (žlutá zimnice, požaduje Egypt). Zmínka o britském FCDO v textu není, nelze ověřit.
- **SL Sierra Leone**
  - `etaCostEur`: Text neobsahuje žádný poplatek za e-vízum (80 USD z poznámky nelze ověřit); stejně tak tvrzení o víze po příletu za hotovost. MZV jen uvádí, že o vízum lze žádat přes e-visa portál.
  - `maxStayDays`: Text MZV ani oficiální stránka (jen prázdná šablona) délku pobytu neuvádějí; 30 dní nelze ověřit.
- **SM San Marino**
  - `visa`: Stránka MZV je obecná šablona o volném pohybu v EU a San Marino jako členský stát nijak neuvádí; potvrzuje jen uznání OP i pasu a pobyt do 3 měsíců bez formalit, takže 'none' vs 'eu' z textu nelze rozlišit.
- **SO Somálsko**
  - `visa`: MZV popisuje eTAS jako 'turistické povolení' (electronic Travel Authorization System), ne jako e-vízum; podle definice by to mohlo být 'eta', záznam má 'evisa'. Povinnost předem online, 30 dní a 64 USD jsou potvrzeny. Text zároveň zmiňuje vízum po příletu (Somaliland, nebo se sponzorským dopisem).
- **SR Surinam**
  - `etaCostEur`: Jediný zdroj v souboru (MZV, 2 sekce) uvádí poplatek 25 USD nebo 25 EUR (cca 22-25 €), záznam má 50 € a tvrdí, že MZV je zastaralé. Sekce oficiálního webu v souboru chybí, takže 50 € ani 8 € VFS z textu nelze potvrdit ani vyvrátit.
  - `notes`: Formulář ICF (icf.sr), poplatek VFS 8 € ani zastaralost údaje MZV text nezmiňuje; text potvrzuje jen bezvízový pobyt do 90 dnů, povinný poplatek Entry Fee online přes VFS a pas platný min. 6 měsíců od prvního vstupu.
- **SS Jižní Súdán**
  - `etaCostEur`: MZV uvádí rozpětí 100-350 USD podle délky pobytu; záznam (89 EUR) odpovídá spodní hranici 100 USD, zatímco maxStayDays 180 odpovídá dražší variantě. Délka pobytu je v textu dána jen jako platnost víza až 6 měsíců.
- **SV Salvador**
  - `maxStayDays`: Navrženo 90 („Občané ČR mohou na území státu pobývat po dobu 90 dnů bez víza, pouze s platným cestovním pasem.“), protikontrola to nepovažuje za jasnou změnu: Záznam vědomě vychází z novějšího pravidla (180 dní od 1/2023) a v poznámce sám uvádí, že MZV stále píše 90; stránka MZV je tedy nejspíš jen neaktualizovaná. Patří to mezi nejisté položky (shodně s out-manual.json), ne mezi změny.
  - `notes`: Navrženo "Bezvízově 90 dní (MZV), pobyt lze prodloužit na imigračním úřadu. V rámci C4 (SV, HN, GT, NI) se 90 dní sčítá. Poplatek při odletu bývá v ceně letenky." („Občané ČR mohou na území státu pobývat po dobu 90 dnů bez víza, pouze s platným cestovním pasem.“), protikontrola to nepovažuje za jasnou změnu: Změna poznámky stojí a padá s maxStayDays: stávající poznámka rozpor s MZV (90 dnů) výslovně uvádí a nový text by údaj o 180 dnech od 1/2023 vypustil. Rozhodnout až společně s nejistou položkou maxStayDays.
- **SY Sýrie**
  - `maxStayDays`: Text: vízum je vstupní na pobyt 15 dnů, prodloužení na jeden měsíc a dále dle uvážení úřadů; záznam má 30. Nejednoznačné a stránka je zastaralá.
  - `visa`: Text MZV výslovně říká 'Udělení víza na hranicích Sýrie není možné' (vízum na ambasádě v Praze), záznam má voa podle neoficiálních zdrojů. Stránka MZV je zjevně zastaralá (kurs květen 2009), novější zdroj v souboru není, proto nelze rozhodnout.
- **TD Čad**
  - `etaCostEur`: Text neobsahuje tarif poplatků (stránka o nových tarifech jen odkazuje na platformu); 70 EUR nelze ověřit, poznámka sama uvádí 'neověřeno'.
  - `maxStayDays`: Text (evisa.td) nezmiňuje délku pobytu ani kategorie 15/30/90 dní z poznámky; null tedy nelze potvrdit ani vyvrátit.
  - `passportValidity`: Text uvádí jen 'Passeport valide'; požadavek 6 měsíců po vstupu není v textu. MZV sekce v souboru chybí.
- **TG Togo**
  - `etaCostEur`: Text neuvádí poplatek za turistické e-vízum (jen nesouvisející 'Total 6000 Fr CFA' u zastaralé položky); sazby 25 000/45 000/65 000 CFA z poznámky nelze ověřit.
  - `maxStayDays`: MZV ani oficiální web nestanoví maximální délku pobytu pro Čechy; 90 dní nelze ověřit.
  - `notes`: Oficiální web uvádí online 'formulaire d'immigration' před cestou (u afrických občanů výslovně nejpozději 24 h před příjezdem); z textu není jasné, zda je povinný i pro občany ČR, proto nenavrhuji změnu.
- **TJ Tádžikistán**
  - `passportValidity`: Text platnost pasu vůbec neuvádí, '6 měsíců po odjezdu' nelze ověřit.
- **TM Turkmenistán**
  - `maxStayDays`: Text neuvádí maximální délku turistického pobytu (jen vízum do 10 dnů při příletu); null je s textem slučitelné, ale nepotvrzené.
  - `visa`: Jediný zdroj v souboru (MZV) uvádí vízum na zastupitelském úřadu se schváleným pozváním; vízum do 10 dnů při příletu jen po předchozím schválení zvoucí stranou. E-vízový portál od 1. 10. 2026 text neuvádí a oficiální web v souboru chybí, takže evisa nelze ověřit ani vyvrátit.
- **TV Tuvalu**
  - `passportValidity`: Záznam uvádí na prvním místě 6 měsíců po příjezdu (FCDO, AA), ale tyto zdroje nejsou v souboru; MZV v textu uvádí jen platnost nejméně 3 měsíce po plánovaném návratu.
- **TZ Tanzanie**
  - `notes`: Poznámka říká 'nutná zpáteční letenka', MZV uvádí jen, že úředník pasové kontroly může o zpáteční letenku požádat (při vízu na hranici).
  - `visa`: MZV uvádí dvě možnosti: online e-vízum nebo vízum na letišti i pozemních přechodech (jednovstupové). Vízum po příletu je tedy možné, takže 'evisa' (předem online povinně) je sporné proti 'voa'; text nestanoví, která varianta je hlavní.
- **UG Uganda**
  - `vaccinesRequired`: Záznam tvrdí, že od 2. 10. 2026 průkaz žluté zimnice není povinný; v textu to není. MZV uvádí povinnost pro všechny (sdělení ministerstva zdravotnictví Ugandy z 27. 1. 2020) a doklad o očkování proti dětské obrně u dětí do 5 let. Soubor neobsahuje oficiální ugandský zdroj.
- **UZ Uzbekistán**
  - `passportValidity`: Text MZV říká jen, že je nutný platný cestovní pas, minimální zbývající platnost neuvádí; 'doporučeno 6 měsíců' z textu ověřit nelze.
  - `vaccinesRecommended`: Text MZV doporučuje navíc obrnu, tetanus, meningitidu A+C, záškrt a vzteklinu (při kontaktu se zvířaty); záznam uvádí jen hepatitidu A a B a břišní tyfus (podmnožina, ne rozpor).
- **VC Svatý Vincenc a Grenadiny**
  - `maxStayDays`: Navrženo 180 („Povolení ke vstupu vydává při příjezdu imigrační úředník a platí pro země schengenského prostoru šest (6) měsíců.“), protikontrola to nepovažuje za jasnou změnu: Citace v textu MZV je doslova, ale záznam se vědomě řídí dohodou EU o bezvízovém styku (90 dní) a v poznámce oba údaje výslovně uvádí („až 6 měs. (MZV), dle dohody EU 90 dní“). Věta MZV navíc mluví o platnosti povolení ke vstupu, ne jednoznačně o maximální délce turistického pobytu, takže jde o rozpor dvou zdrojů, ne o jasnou opravu.
- **VE Venezuela**
  - `vaccinesRecommended`: Text MZV doporučuje tetanus, obrnu, záškrt, tyfus, žloutenku A i B a žlutou zimnici; v záznamu chybí obrna a záškrt (podmnožina, ne rozpor); malárii text nezmiňuje.
  - `vaccinesRequired`: Záznam uvádí povinnou žlutou zimnici při příletu z/přes Brazílii, ale MZV píše, že očkovací průkaz se pro vstup do země nevyžaduje (nutný je jen při pokračování např. do Brazílie); přílet z Brazílie text výslovně neřeší.
- **XK Kosovo**
  - `passportValidity`: Sekce 1 MZV říká, že stačí platný český občanský průkaz, sekce 2 uvádí OP s biometrickými údaji (vydávaný od 2.8.2021); záznam přebírá přísnější verzi. Pas: 6 měsíců při vstupu potvrzeno.
- **ZA Jihoafrická republika**
  - `passportValidity`: Text neobsahuje požadavek 30 dní po odjezdu; MZV uvádí 90 dní (sekce 1 jako doporučení, sekce 2 Doklady jako požadavek) a min. 2 volné strany naproti sobě. Hodnotu 30 dní nelze z textu ověřit.
- **ZM Zambie**
  - `passportValidity`: MZV uvádí pas platný 6 měsíců od vstupu a alespoň 2 volné stránky; záznam uvádí 3 volné strany (s poznámkou, že MZV uvádí 2). Hodnotu 3 text nepodporuje ani nevyvrací.
- **ZW Zimbabwe**
  - `vaccinesRequired`: MZV Doklady: při příjezdu ze země s výskytem žluté zimnice je nutný očkovací průkaz; MZV Zdravotnictví: 'Při cestách do Zimbabwe není povinné žádné očkování'. Část záznamu '(i tranzit nad 12 h)' v textu není.

## Neověřitelné (4)

- **KN Svatý Kryštof a Nevis**: Soubor obsahuje jen úvodní stránku portálu knatravelform.kn bez údajů o vstupních podmínkách, poplatku či délce pobytu; chybí sekce MZV.
- **KI Kiribati**: Soubor obsahuje jen binární data PDF (obrázek bez čitelného textu, nejsou tam ani stránky MZV); klíčová pole nelze ověřit.
- **MH Marshallovy ostrovy**: Soubor obsahuje jen surová binární data PDF (rmiimmigration.org), žádný čitelný text; klíčová pole nelze ověřit.
- **CZ Česko**: Stránka MZV 'Cestovní doklady' popisuje výjezd z ČR a seznam států, kam stačí OP; o vstupu do ČR (visa, idCard, maxStayDays) ani o očkování nic neříká.

## Poznámky

- MZV při stahování omezuje počet dotazů (HTTP 429); stahovat je potřeba po jedné stránce s pauzou.
- Oficiální weby z `etaUrl` dávají čitelný text jen zhruba u poloviny zemí (ostatní jsou aplikace v JavaScriptu), takže poplatky se z nich často ověřit nedaly – proto je tolik nejistých položek u `etaCostEur`.
- Dříve označené sporné body: Thajsko 30 dní od 15. 9. 2026, Kyrgyzstán 30 dní během 60 dní, Korea (výjimka z K-ETA do 31. 12. 2026) a Egypt (vízum 30 USD od 1. 3. 2026) text MZV potvrzuje.
- Podklady jsou lokálně v `%TEMP%\atlas-qa\entry\` (`vpages\` = stažené texty, `verify\` = dávky, výstupy agentů a protikontroly, `vmerge.js` = sloučení).
