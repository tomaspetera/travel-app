# Vstupní podmínky pro občany ČR – 197 zemí

- Stav k říjnu 2026, rešerše 5.–6. 10. 2026 z Peterova počítače (běžný internet). Data: `entry.json` (197 záznamů, pořadí jako `data/countries.json`).
- Primární zdroj: MZV ČR (Encyklopedie států – „Víza a vstupní režim“, „Cestovní doklady“, „Zdravotní péče“) a weby zastupitelských úřadů; u elektronických registrací a e-víz oficiální web cílové země; u žluté zimnice seznamy WHO a CDC.
- **Ověřeno na oficiální stránce (`verified: true`): 194 ze 197.** Neověřených: 3 (seznam níže).
- **Tohle je první úplná verze:** každou zemi zpracoval jeden rešeršní agent. Nezávislé ověření druhým agentem, průchod kritika a cílené kontroly teprve běží; po nich přijde aktualizace souboru i tohoto reportu.
- `verified: true` znamená, že typ víza, pravidlo pro občanský průkaz a délku pobytu agent ten den četl na oficiální stránce (MZV nebo úřad cílové země). Neznamená to záruku – stránky MZV bývají místy zastaralé a pravidla se mění.

## Souhrn

| Režim | Zemí |
|---|---|
| EU / Schengen (stačí OP) (`eu`) | 31 |
| bez víza (`none`) | 85 |
| elektronická registrace předem (`eta`) | 13 |
| elektronické vízum předem (`evisa`) | 37 |
| vízum na hranici (`voa`) | 14 |
| vízum na úřadě předem (`visa`) | 17 |

Občanský průkaz stačí v 42 zemích; mimo režim `eu` to jsou: Albánie (AL), Andorra (AD), Bosna a Hercegovina (BA), Gruzie (GE), Kosovo (XK), Moldavsko (MD), Monako (MC), San Marino (SM), Severní Makedonie (MK), Srbsko (RS), Černá Hora (ME).

## Elektronické registrace a e-víza

| Země | Typ | Název | Cena | Oficiální web |
|---|---|---|---|---|
| Austrálie (AU) | eta | eVisitor (subclass 651) | zdarma | https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/evisitor-651 |
| Izrael (IL) | eta | ETA-IL | ~7 € | https://israel-entry.piba.gov.il/ |
| Kanada (CA) | eta | eTA (Canada) | ~4 € | https://www.canada.ca/en/immigration-refugees-citizenship/services/visit-canada/eta/apply.html |
| Kapverdy (CV) | eta | EASE (předregistrace + letištní taxa TSA) | ~31 € | https://www.ease.gov.cv/ |
| Keňa (KE) | eta | eTA (Kenya) | ~27 € | https://etakenya.go.ke/ |
| Nový Zéland (NZ) | eta | NZeTA (+ IVL) | ~58 € | https://nzeta.immigration.govt.nz/ |
| Palestina (PS) | eta | ETA-IL (Izrael) | — | https://israel-entry.piba.gov.il/ |
| Seychely (SC) | eta | Travel Authorisation (Seychelles Electronic Border System) | ~10 € | https://seychelles.govtas.com/ |
| Spojené království (GB) | eta | ETA (UK) | ~23 € | https://www.gov.uk/eta/apply |
| Spojené státy americké (US) | eta | ESTA | ~36 € | https://esta.cbp.dhs.gov/ |
| Srí Lanka (LK) | eta | ETA (Srí Lanka) | zdarma | https://www.eta.gov.lk/ |
| Surinam (SR) | eta | Entry Fee (VFS) + formulář ICF | ~50 € | https://suriname.vfsevisa.com |
| Svatý Kryštof a Nevis (KN) | eta | eTA (St. Kitts and Nevis) | ~15 € | https://www.knatravelform.kn/en |
| Ázerbájdžán (AZ) | evisa | ASAN Visa (e-Visa) | ~22 € | https://evisa.gov.az/ |
| Bahrajn (BH) | evisa | eVisa (Bahrajn) | ~24 € | https://www.evisa.gov.bh/ |
| Benin (BJ) | evisa | e-Visa Bénin | ~50 € | https://evisa.bj/ |
| Bhútán (BT) | evisa | Bhutan e-Visa (Immigration Services Portal) | ~36 € | https://www.immi.gov.bt/home/ |
| Burkina Faso (BF) | evisa | eVisa Burkina | ~50 € | https://www.visaburkina.bf/en/home/ |
| Burundi (BI) | evisa | Visa d'entrée aéroport (online žádost CGM) | ~80 € | https://migration.gov.bi/ |
| Čad (TD) | evisa | e-Visa Tchad | ~70 € | https://evisa.td/ |
| Džibutsko (DJ) | evisa | eVisa Djibouti | ~21 € | https://www.evisa.gouv.dj/ |
| Etiopie (ET) | evisa | e-Visa | ~55 € | https://www.evisa.gov.et/ |
| Gabon (GA) | evisa | e-Visa | ~85 € | https://evisa.dgdi.ga/ |
| Ghana (GH) | evisa | Ghana e-Visa | ~232 € | https://evisa.immigration.gov.gh/ |
| Guinea (GN) | evisa | e-Visa Guinea (DCPAF) | ~89 € | https://www.paf.gov.gn/visa |
| Indie (IN) | evisa | e-Visa (e-Tourist Visa) | ~22 € | https://indianvisaonline.gov.in/evisa/tvoa.html |
| Irák (IQ) | evisa | e-Visa (evisa.iq) | ~143 € | https://eservice.evisa.iq/ |
| Jižní Súdán (SS) | evisa | e-Visa | ~89 € | https://evisa.gov.ss/ |
| Kamerun (CM) | evisa | e-Visa (evisacam) | ~153 € | https://www.evisacam.cm/ |
| Kuba (CU) | evisa | eVisa Cuba | ~31 € | https://evisacuba.cu/en/inicio |
| Laos (LA) | evisa | Lao eVisa | ~45 € | https://laoevisa.gov.la/ |
| Libérie (LR) | evisa | Visa on Arrival (online žádost předem) | ~91 € | https://visaonarrival.lis.gov.lr/ |
| Malawi (MW) | evisa | Malawi e-Visa | ~45 € | https://evisa.gov.mw/ |
| Mauritánie (MR) | evisa | e-Visa (ANRPTS) | ~55 € | https://anrpts.gov.mr/visa/requestvisa |
| Mosambik (MZ) | evisa | eVisa (evisa.gov.mz) | ~170 € | https://evisa.gov.mz/ |
| Myanmar (Barma) (MM) | evisa | Myanmar eVisa | ~45 € | https://evisa.moip.gov.mm/ |
| Namibie (NA) | evisa | e-Visa / Visa on Arrival (MHAISS) | ~85 € | https://eservices.mhaiss.gov.na/ |
| Nigérie (NG) | evisa | e-Visa (NIS) | ~257 € | https://evisa.immigration.gov.ng/ |
| Pákistán (PK) | evisa | Pakistan Online Visa System (e-Visa) | — | https://visa.nadra.gov.pk/ |
| Papua-Nová Guinea (PG) | evisa | eVisa – Easy Visitor Permit (60 dní) | ~45 € | https://evisa.ica.gov.pg/evisa/account/Apply |
| Pobřeží slonoviny (CI) | evisa | E-visa (SNEDAI) | ~73 € | https://snedai.com/e-visa/ |
| Rovníková Guinea (GQ) | evisa | e-Visa | ~67 € | https://www.equatorialguinea-evisa.com/ |
| Rusko (RU) | evisa | Jednotné elektronické vízum (e-viza) | ~45 € | https://evisa.kdmid.ru/ |
| Saúdská Arábie (SA) | evisa | Saudi eVisa | ~105 € | https://visa.visitsaudi.com/ |
| Sierra Leone (SL) | evisa | eVisa (Sierra Leone) | ~71 € | https://www.evisa.sl/ |
| Somálsko (SO) | evisa | eTAS (e-Visa) | ~57 € | https://etas.gov.so/ |
| Tanzanie (TZ) | evisa | e-Visa (Tanzania eVisa) | ~45 € | https://visa.immigration.go.tz/ |
| Togo (TG) | evisa | e-Visa (Togo Voyage) | ~38 € | https://voyage.gouv.tg/ |
| Turkmenistán (TM) | evisa | e-Visa (Turkmenistán) | — | https://evisa.migration.gov.tm/ |
| Uganda (UG) | evisa | Uganda e-Visa | ~45 € | https://visas.immigration.go.ug/ |
| Kolumbie (CO) | none | Check-Mig (nepovinný online předregistrační formulář) | zdarma | https://apps.migracioncolombia.gov.co/pre-registro/ |
| Demokratická republika Kongo (CD) | visa | e-Visa RDC (visa volant) | ~268 € | https://evisa.gouv.cd/ |
| Írán (IR) | visa | E-VISA (online žádost, vízum vydá ambasáda) | — | https://evisa.mfa.ir/en/ |
| Libye (LY) | visa | e-Visa Libya | ~56 € | https://evisa.gov.ly/ |
| Egypt (EG) | voa | e-Visa | ~27 € | https://www.visa2egypt.gov.eg/eVisa/Home |
| Guyana (GY) | voa | Visitor Visa on Arrival (online předschválení, ISS e-Services) | ~22 € | https://eservices.iss.gov.gy/visitor-visa |
| Indonésie (ID) | voa | e-VOA | ~25 € | https://evisa.imigrasi.go.id/ |
| Jordánsko (JO) | voa | e-Visa (volitelné) | ~50 € | https://eservices.moi.gov.jo/MOI_EVISA/faces/Pages/Runnables/login.jsf |
| Kambodža (KH) | voa | Cambodia e-Visa (volitelné) | ~27 € | https://www.evisa.gov.kh/ |
| Kuvajt (KW) | voa | Kuwait e-Visa (volitelné) | ~9 € | https://kuwaitvisa.moi.gov.kw/ |
| Madagaskar (MG) | voa | eVisa Madagascar | ~35 € | https://evisamada-mg.com/en/home |
| Nepál (NP) | voa | Visa on Arrival – online formulář (Nepali Port) | ~45 € | https://nepaliport.immigration.gov.np/ |
| Rwanda (RW) | voa | e-Visa (Irembo) | ~45 € | https://irembo.gov.rw/home/citizen/all_services |
| Zimbabwe (ZW) | voa | eVisa Zimbabwe (volitelné) | ~27 € | https://www.evisa.gov.zw/ |

## Vízum na hranici a vízum předem na úřadě

- **Vízum na hranici (`voa`):** Egypt (EG), Guyana (GY), Indonésie (ID), Jordánsko (JO), Kambodža (KH), Komory (KM), Kuvajt (KW), Libanon (LB), Madagaskar (MG), Maledivy (MV), Nepál (NP), Rwanda (RW), Sýrie (SY), Zimbabwe (ZW).
- **Vízum předem na úřadě (`visa`):** Afghánistán (AF), Alžírsko (DZ), Bangladéš (BD), Demokratická republika Kongo (CD), Eritrea (ER), Guinea-Bissau (GW), Jemen (YE), Kongo (republika) (CG), Libye (LY), Mali (ML), Nauru (NR), Niger (NE), Severní Korea (KP), Středoafrická republika (CF), Súdán (SD), Írán (IR), Čína (CN).

## Povinné očkování

- **Žlutá zimnice povinná pro všechny cestující (22):** Angola (AO), Benin (BJ), Bolívie (BO), Burkina Faso (BF), Burundi (BI), Demokratická republika Kongo (CD), Gabon (GA), Ghana (GH), Guinea-Bissau (GW), Jižní Súdán (SS), Kamerun (CM), Kongo (republika) (CG), Libérie (LR), Mali (ML), Niger (NE), Nigérie (NG), Pobřeží slonoviny (CI), Sierra Leone (SL), Středoafrická republika (CF), Togo (TG), Uganda (UG), Čad (TD).
- **Žlutá zimnice jen při příletu z rizikové země nebo jinak podmíněně (90):** Albánie (AL), Alžírsko (DZ), Antigua a Barbuda (AG), Austrálie (AU), Bahamy (BS), Bahrajn (BH), Bangladéš (BD), Barbados (BB), Bhútán (BT), Botswana (BW), Brazílie (BR), Brunej (BN), Dominika (DM), Dominikánská republika (DO), Džibutsko (DJ), Egypt (EG), Eritrea (ER), Eswatini (SZ), Etiopie (ET), Fidži (FJ), Filipíny (PH), Gambie (GM), Grenada (GD), Guatemala (GT), Guinea (GN), Guyana (GY), Haiti (HT), Honduras (HN), Indie (IN), Indonésie (ID), Irák (IQ), Jamajka (JM), Jemen (YE), Jihoafrická republika (ZA), Jordánsko (JO), Kambodža (KH), Kapverdy (CV), Katar (QA), Kazachstán (KZ), Keňa (KE), Kolumbie (CO), Komory (KM), Kostarika (CR), Kuba (CU), Libye (LY), Madagaskar (MG), Malajsie (MY), Malawi (MW), Maledivy (MV), Malta (MT), Mauritánie (MR), Mikronésie (FM), Mosambik (MZ), Myanmar (Barma) (MM), Namibie (NA), Nepál (NP), Nikaragua (NI), Omán (OM), Papua-Nová Guinea (PG), Paraguay (PY), Pákistán (PK), Rovníková Guinea (GQ), Rwanda (RW), Salvador (SV), Samoa (WS), Saúdská Arábie (SA), Senegal (SN), Severní Korea (KP), Seychely (SC), Singapur (SG), Somálsko (SO), Spojené arabské emiráty (AE), Srí Lanka (LK), Surinam (SR), Svatá Lucie (LC), Svatý Kryštof a Nevis (KN), Svatý Tomáš a Princův ostrov (ST), Svatý Vincenc a Grenadiny (VC), Súdán (SD), Tanzanie (TZ), Thajsko (TH), Tonga (TO), Trinidad a Tobago (TT), Tunisko (TN), Venezuela (VE), Zambie (ZM), Zimbabwe (ZW), Írán (IR), Čína (CN), Šalomounovy ostrovy (SB).
- **Jiné povinné očkování:** Afghánistán (AF) – při pobytu nad 4 týdny může být při odjezdu vyžadován doklad o očkování proti obrně; Gruzie (GE) – obrna při příjezdu ze zemí s rizikem přenosu.
- Bez povinného očkování: 83 zemí.

## Neověřené záznamy (3)

| Země | Režim v souboru | Poznámka |
|---|---|---|
| Palestina (PS) | eta | MZV varuje před cestami. Vlastní hraniční kontrola neexistuje – vstup jen přes Izrael (ETA-IL) nebo Izraelem kontrolovaný přechod z Jordánska; Gaza nepřístupná. |
| Sýrie (SY) | voa | MZV varuje před cestami do země. Dle neoficiálních zdrojů od 2025 vízum při příjezdu (cca 75 USD hotově); MZV stále uvádí vízum na ambasádě. |
| Turkmenistán (TM) | evisa | Od 1. 10. 2026 nový portál e-víz (turistické e-TU, 7 prac. dní); MZV dosud uvádí vízum na ambasádě se zvacím dopisem. Po příletu placený PCR test. |

## Kde si rešerše nebyla jistá (113 zemí)

Poznámky agentů v původním znění (starší česky nebo anglicky). Řazeno podle pořadí zemí v souboru.

- **Afghánistán (AF):** Kept visa="visa" per MZV (embassy visa, read today) and mfa.gov.af (tourist visa via embassies; arrival visa only with an official letter). A tourist e-visa also exists at eafghans.com (30 days, single entry, Kabul airport only, about 8 + 120 USD plus processing fees), but it runs on a platform 'authorized by the General Consulate of Afghanistan in Dubai', not a government domain, so etaUrl is null and it is only mentioned in notes. maxStayDays=30 is my choice (e-visa length); MZV says visas are issued for stays up to 3 months. Yellow fever: WHO 2022 list says no entry requirement, an older WHO list said required from risk countries; I used the 2022 list and MZV ('vaccination not compulsory').
- **Alžírsko (DZ):** maxStayDays 90 is the legal maximum per entry quoted by the Algerian embassy in Prague; the actual tourist visa is often issued for a shorter stay. Visa fee is not published on the embassy page. Visa on arrival applies only to organised Saharan-south trips via an approved agency (Algerian MFA announcement, undated). Czech embassy 'conditions of travel' page is stale (last update Nov 2022, Covid only).
- **Angola (AO):** Visa-free regime is confirmed by MZV and by the evisa.ao home page (30 days per entry, 90 per year), but the 'full list of exempt countries' page on evisa.ao is an empty placeholder; Czech Republic on the list was confirmed only via the decree 189/23 text on lex.ao (legal database) and the Angolan embassy in Budapest. Yellow fever: MZV says the certificate may be required only when arriving from an endemic country, WHO/CDC say required for all travellers from 9 months - I used WHO/CDC.
- **Argentina (AR):** Povinné zdravotní pojištění a čestné prohlášení (DNU 366/2025, účinné od 29. 5. 2025): velvyslanectví Argentiny píše, že zatím není regulováno a nevyžaduje se, ale média a aerolinie uváděly platnost od 1. 7. 2025. Skutečné vymáhání v 10/2026 se mi nepodařilo potvrdit na oficiálním webu migrací, který je nedostupný.
- **Bahrajn (BH):** Judgement call evisa vs voa: both are open to Czech citizens (Czech Republic is on both official evisa.gov.bh lists); I chose evisa because MZV names the online route first. The e-visa fee (5 BHD application + 5 BHD issuance, two-week single entry) was read on npra.gov.bh; the visa-on-arrival fee was not read officially because the eligibility form on evisa.gov.bh is captcha-protected. maxStayDays=14 reflects the two-week visa; a 3-month multiple-entry e-visa (5 + 12 BHD) also exists. Recommended vaccines are general travel-medicine advice, the MZV health page lists none.
- **Bangladéš (BD):** Judgement call visa vs voa: I chose "visa" because both MZV and the Bangladesh embassy in Berlin (page updated 4 Sep 2026) advise getting the visa in advance and call visa on arrival discretionary / 'limited circumstances'. In practice Czech tourists can get a visa on arrival at Dhaka airport (MZV: 40 EUR or 50 USD, 15-30 days). If the pipeline prefers the practical route, this should be "voa". bangladeshembassy.de (the VOA page MZV links to) no longer resolves; visa.gov.bd returned a server error today.
- **Belize (BZ):** Passport validity conflict: MZV says 6 months after the end of stay, the Belize Tourism Board (travelbelize.org) says at least 30 days after arrival; both are in the field. immigration.gov.bz only says 'complete your E-embarkation form online before your travel' - I found no official statement that iDeclare is strictly mandatory (only agency sites claim it). Departure fee amounts (approx. 40 USD air / 19 USD land) come from MZV only. Yellow fever: left empty because MZV, WHO 2022 country list and CDC (updated April 2025) all say not required, although the older WHO Annex 1 (2019) listed a requirement.
- **Benin (BJ):** Yellow fever status conflicts: WHO list (2022), CDC (page updated Aug 2026) and MZV say the certificate is required from all travellers, but a Benin Ministry of Health notice on the official evisa.bj (posted 16 Sep 2026, read live today) says vaccination cards are no longer checked at entry points and the vaccine is only recommended. I kept the requirement in vaccinesRequired with the caveat. Passport validity is not stated on any official page I read (6 months is a recommendation, not a quoted rule). MZV visa page is outdated (still says visa from the embassy in Berlin), so source is evisa.bj/faqs.
- **Bhútán (BT):** Visa regime verified (MZV + bhutan.travel/visa + immi.gov.bt FAQ: e-visa 40 USD, SDF 100 USD/night until 31 Aug 2027, max 90 days). Open points: MZV says travel insurance is mandatory, but the official Bhutan pages no longer list insurance among the visa requirements (left out of notes); processing time is 3 working days per Dept. of Immigration vs 5 per bhutan.travel; yellow-fever certificate requirement comes from MZV health page while the WHO 2022 list says 'no requirement'. etaCostEur 36 = 40 USD at today's rate 0.8925 (SDF not included).
- **Bolívie (BO):** Žlutá zimnice: WHO (2022) píše povinnost jen při příjezdu z rizikových zemí, MZV a Cancillería pro cesty do endemických oblastí/Amazonie, CDC (3. 9. 2026) pro všechny od 1 roku. Web DIGEMIG byl nedostupný, takže 90 dnů/rok a pas místo OP stojí na MZV a na DS 27150, kde je Česko ve skupině I bez víz.
- **Botswana (BW):** Low uncertainty: www.gov.bw could not be read (expired TLS certificate), so the regime rests on MZV (note verbale of 1 Aug 2024) plus the official evisa.gov.bw list of visa-required countries, which does not include the Czech Republic. No official page read today states the 6-month passport rule other than MZV.
- **Brazílie (BR):** Platnost pasu: MZV ČR uvádí 6 měsíců od vstupu, brazilské ministerstvo zahraničí (2024) jen platnost po celou dobu pobytu. Obojí je v poli i v notes. Podmíněnou povinnost žluté zimnice z jihoamerických rizikových zemí uvádí jen MZV, WHO a CDC píší, že se nevyžaduje.
- **Brunej (BN):** 90 days visa-free verified on MZV and Brunei MFA (Category D1); E-Arrival Card confirmed on immigration.gov.bn. Not stated on an official page today: that the E-Arrival Card is free and how early it must be filed. Polio requirement taken from WHO 2022 list (data from 2019).
- **Burkina Faso (BF):** Fee taken from the official visaburkina.bf table (tourist visa 33 000 F CFA single entry, about 50 EUR; 55 000 multiple); the card-processing surcharge for online payment is not stated, and older sources quoted 55 000 CFA for the e-visa. MZV warning page was last updated 23 Jan 2025.
- **Burundi (BI):** Classified as 'evisa' because MZV recommends the online application at migration.gov.bi, but it is really an online pre-application for an entry visa issued at Bujumbura airport; visa on arrival without pre-application is also possible (90 USD cash, 30 days). Passport validity: MZV says 3 months beyond the planned stay, UK FCDO says 6 months after arrival. No yellow-fever discrepancy (MZV, WHO 2022 and CDC all say required for all).
- **Demokratická republika Kongo (CD):** Classified as 'visa' because MZV (read today) and the Czech embassy in Kinshasa page (updated 30 Sep 2025) say the visa must be obtained in advance at the DRC embassy in Prague. The official DGM portal evisa.gouv.cd also offers an e-visa ('visa volant') open to tourists: 300 USD (about 268 EUR) plus a 90 USD 7-day airport visa paid at the border - I put it in the eta fields as an alternative although visa='visa'; the consumer may prefer these fields null. maxStayDays null (depends on the visa issued, not stated on an official page). Passport validity 6 months is from UK FCDO / France Diplomatie, MZV gives no figure. The MZV page itself is stale (still describes covid measures).
- **Dominika (DM):** Stay length 180 days is from MZV and the Dominica government portal (Czech Republic listed under 'not exceeding six months'); the EU-Dominica visa waiver agreement speaks of 90 days in 180, which I did not re-read today. The ED card site says the form 'should be submitted' max 3 days before travel but does not use the word mandatory. Passport validity 6 months is from MZV only (Discover Dominica just says 'valid passport').
- **Dominikánská republika (DO):** Regime is solid (MZV + Ministry of Tourism + DGM). Passport-validity waiver for EU citizens expires 31 Dec 2026 and needs re-checking after that; MZV still states 6 months. E-ticket is a mandatory free entry/exit form - classified as visa 'none' with etaName null following the brief's Thailand TDAC precedent, not as 'eta'; reviewer may prefer otherwise. Yellow fever from Venezuela is on the tourism ministry page (rule dated 2021) but not in the WHO/CDC lists, which name only four Brazilian states.
- **Džibutsko (DJ):** Fee conflict: the official portal FAQ (read today) says 12 USD for 1-14 days and 23 USD for 15-90 days, and the portal text mentions 10 % VAT added at payment, while MZV says the total may exceed 100 USD and processing can take up to 2 weeks (official FAQ: 72 hours). Visa on arrival: official FAQ and MZV say not available; UK FCDO and France Diplomatie (15 Sep 2026) still say it can be obtained on arrival - I followed the official portal and MZV.
- **Egypt (EG):** Chose visa=voa (MZV lists visa on arrival at Cairo, Hurghada, Marsa Alam first; e-Visa is the alternative, so etaName/etaCostEur/etaUrl describe the optional e-Visa, 30 USD = 27 EUR at ECB 1.1204). idCard=false rests on MZV wording 'cestovní doklad' with 6 months validity; no official page read today explicitly says a Czech ID card is refused. The e-visa portal timed out on a re-fetch tonight; fee taken from the portal FAQ dump saved earlier today.
- **Ekvádor (EC):** Povinný certifikát žluté zimnice pro cestující z BO/BR/CO/PE (od 12. 5. 2025) uvádí MZV i CDC (9/2026) jako platný, ale ekvádorské ministerstvo zdravotnictví a tisk (27. 8. 2025) ho zrušily a nahradily doporučením. Dal jsem do vaccinesRequired prázdno. Výpis z rejstříku na pozemní hranici s Peru a Kolumbií je jen z MZV (od 5/2024 existuje alternativa přes SIMIEC).
- **Eritrea (ER):** maxStayDays=30 is not on the MZV page or the Berlin embassy page; it comes from the official Eritrean Embassy in Washington site ('typically valid for one month' after arrival) and MZV's mention of 30-day extensions. Passport validity conflicts: MZV says 3 months after the trip, Eritrean embassies say 6 months (used 6). MZV health page says yellow fever vaccination is mandatory, but WHO (2021 entry) and CDC (Apr 2025) say only when arriving from a risk country (used the latter). MZV visa page is visibly old (fax numbers, 15 USD departure fee).
- **Eswatini (SZ):** Official Eswatini government sites (gov.sz, evisa.gov.sz) refused/timed out, so confirmation comes from MZV visa.html plus the Eswatini Tourism Authority visa checker (Czech Republic is in the exempt list, 30 days). Passport validity conflicts: MZV 6 months after end of stay, tourism authority 3 months after travel dates (used the stricter 6). Yellow fever rule is from WHO list dated 2018 and CDC Apr 2025.
- **Etiopie (ET):** MZV says the 90-day e-Visa is currently not available, while the official evisa.gov.et tourist page today lists both 30 days (62 USD) and 90 days (152 USD); used 30 days. Visa on arrival at Bole exists per the official FAQ but I could not see whether Czechia is on the paginated eligibility list; MZV advises against relying on it.
- **Fidži (FJ):** Digitální příletová karta: některé sekundární weby tvrdí povinné online vyplnění do 72 h před příletem, ale oficiální weby (Immigration, Tourism Fiji) uvádějí jen běžnou příletovou kartu a blog z 7/2026 říká, že digitální karta zatím povinná není. Do dat nezapsáno, stojí za pozdější kontrolu.
- **Filipíny (PH):** 30 days visa-free and eTravel read on MZV (saved today) and immigration.gov.ph (30 days initial stay, 29-day waiver extension, eTravel free). DFA embassy pages with the E.O. 408 country list returned 403, so the Czech listing is confirmed only via MZV and a search snippet. The '72 h before arrival' eTravel window is from secondary sources/memory, not read on an official page today.
- **Gabon (GA):** MZV (visa.html, read today) still says a visa must be obtained at a Gabonese embassy (Berlin/Paris) and does not mention e-visa; the official DGDI portal evisa.dgdi.ga (read today) offers an e-Visa for arrivals at Libreville airport only, 70 EUR + 15 EUR processing fee, 1-3 months single entry, 72 h. I chose visa=evisa and used the DGDI page as source. Payment method is unclear: the portal text today still says payment on arrival, while EY (5 Dec 2025) and visasnews report online payment being introduced in December 2025. Land/sea entry would still need an embassy visa.
- **Gambie (GM):** maxStayDays set to 90 (Gambia High Commission London: EU citizens visa-free for stays not exceeding 90 days; Gambia Immigration Dept lists Czech Republic under visa-exemption agreements without stating a duration). UK FCDO and German AA say the entry stamp is only 21-28 days and must be extended for a fee, so 28 is the practical figure without an extension - stated in notes. Passport validity: MZV and AA say 6 months after the trip, FCDO says only for the duration of stay. The GID entry page still lists a 72h PCR certificate (stale Covid text, ignored).
- **Ghana (GH):** Regime verified on the official portal (Czechia: eVisa required; USD 260 standard). Minor points only: EUR conversion uses the ECB rate of 2026-10-05 (1 EUR = 1.1204 USD); the claim that visa on arrival was discontinued comes from secondary sources and was left out of the record.
- **Grenada (GD):** The 90 days in 180 comes only from MZV (re-read live today); Grenada's own sources confirm 'no visa required' for Czech Republic but the nationality list is a Feb 2021 PDF on the Grenada embassy site and gives no day count. edcard.gov.gd returned HTTP 429/403 but the page text loaded: 'Travellers are required to complete the online Immigration and Customs Form ... available 72 hours prior to your arrival'. The 2 March 2026 launch date is from the Grenada Tourism Authority trade site.
- **Gruzie (GE):** Verified on MZV, geoconsul.gov.ge and Government Resolution No. 256 (matsne.gov.ge, consolidated 24 Feb 2026): 1 year visa-free, EU ID card accepted. Only minor point: the conditional polio requirement comes from the WHO 2022 list; recommended vaccines are general knowledge (MZV health page lists none).
- **Grónsko (GL):** idCard set to false: the Danish Immigration Service (nyidanmark.dk, read today) says an EU/Schengen ID card does not grant entry to Greenland and a passport is required (only Nordic IDs accepted); Greenland Airports (airports.gl) says the same. MZV's Denmark page is softer ('cestovat pouze na občanský průkaz se nedoporučuje'). Passport validity is not stated beyond 'valid passport'; 90 days comes from MZV.
- **Guatemala (GT):** Visa regime verified on MZV (live today). The mandatory online Declaración Jurada Regional de Viajero (SAT) was kept as visa:'none' with etaName null, following the brief's Thailand/TDAC example; the SAT info page is behind Cloudflare (403), but the official form itself (farm2.sat.gob.gt -> cdn.c.sat.gob.gt/declaDelViajeroGt-web/...) loaded and states every traveller entering or leaving must declare. 'Free' and the air/sea scope come from secondary sources and UK FCDO. IGM (igm.gob.gt) visa-category page could not be found (404).
- **Guinea (GN):** Visa type, USD 100 fee and max 90 days read on the official DCPAF portal with CZECH REPUBLIC selected. The EU-specific measures in notes (processing up to 45 days, multiple-entry visas suspended from 1 Aug 2026) come only from secondary reporting (visasnews.com citing a Guinean embassy Brussels communique of 11 Aug 2026); not found on an official page. MZV still says visa at the embassy in Berlin (outdated), so source is the portal, not MZV. Yellow fever: WHO 2022 says only from risk countries, CDC (2025) says required from all arrivals at Conakry airport, and the portal lists the certificate as a visa condition.
- **Guinea-Bissau (GW):** Classified 'visa' per MZV (embassy in Brussels) and German AA (must be applied for before travel). Visa on arrival at Bissau airport exists per AA (80 EUR / 30 days, not at land borders), but France Diplomatie (15 Sep 2026) says only with prior notice to immigration, emergency, or no embassy in the home country - conditions unclear. maxStayDays 30 is the AA figure for the airport visa; embassy visa length not confirmed. No working official e-visa: rgb-visa.com is now full of casino spam links (apparently hijacked), so etaUrl is null. Yellow fever: MZV says not mandatory from Europe, but WHO, CDC, AA and FCDO all say mandatory for everyone from 1 year - used the latter.
- **Guyana (GY):** Zařazení voa vs. evisa: oficiální portál gov.gy to označuje jako 'visa-on-arrival arrangement' s povinným online předschválením (ISS, sponzor/hotel v Guyaně), skutečné vízum se vydává až při příletu (25 USD, 1 měsíc). MZV (vízum na ambasádě, 3 měsíce, 20 USD, pas 10 měsíců) je zastaralé. Platnost pasu 6 měsíců po odjezdu je jen z konzulární stránky Guyany (HC Trinidad), ne z hlavního ministerstva.
- **Haiti (HT):** Visa regime (90 days visa-free, 10 USD arrival fee, 6-month passport, return ticket) verified on MZV live today and matches UK FCDO; no Haitian government page was read. Practical access is uncertain: MZV warns against all travel and urges citizens to leave (warning still valid 5.10.2026); flight availability to Port-au-Prince is known only from press reports. Recommended vaccines (hep A, typhoid) are general knowledge, MZV itself only lists malaria, dengue and cholera risk.
- **Honduras (HN):** Visa regime verified on MZV (live today). Honduran immigration site inm.gob.hn was unreachable (timeout / Cloudflare 522), so the claim that the 'prechequeo migratorio' was abolished in Dec 2023 for everyone except Nicaraguans rests on press reports plus its absence from the Spanish MFA page (updated 12 May 2026) and UK FCDO; the prechequeo.inm.gob.hn site still exists. Yellow-fever wording differs: MZV says all arrivals from South America incl. Panama regardless of age, WHO (2022 list) says ages 1-60 from risk countries and transit over 12 h. Customs DJRV form confirmed live on sisglobal.aduanas.gob.hn; not confirmed whether it is free.
- **Indie (IN):** maxStayDays 30 and etaCostEur 22 refer to the cheapest 30-day e-Tourist visa (25 USD July-March, 10 USD April-June, plus 3 % bank charge); 1-year and 5-year e-visas allow up to 180 days per calendar year. MZV words the e-Arrival Card deadline as 'at the latest 72 hours before entry', the Indian site as 'within 72 hours before arrival'; I followed the Indian site.
- **Indonésie (ID):** I chose 'voa' because MZV describes visa on arrival as the standard route, with e-VOA as the optional online version of the same visa; switch to 'evisa' if the pipeline prefers the pre-arrival route. The yellow fever requirement comes from the WHO list (2022 edition); MZV says no vaccination certificate is required.
- **Irák (IQ):** The visa regime was read today on MZV and evisa.iq, but the federal e-visa fee is not published on the official portal (its country/visa-type search returns no data, and the application form needs personal data). etaCostEur 143 (about 160 USD / 206,000 IQD) comes from secondary sources only (Wikipedia, tour operators). Passport validity differs by source: MZV says 3 months after the end of stay, the Kurdistan portal says 6 months. Yellow fever requirement differs too: CDC (reviewed 25 Aug 2026) says required when arriving from a risk country, the WHO 2022 list says no requirement; I used CDC.
- **Izrael (IL):** Passport validity differs between sources: MZV says 6 months at planned departure, the official PIBA ETA-IL site says at least 3 months from arrival. I recorded the stricter MZV figure and noted the PIBA one. ETA-IL fee of 25 ILS converted to 7 EUR at the ECB rate of 5 Oct 2026.
- **Japonsko (JP):** Visa regime is confirmed (MZV and Japan MOFA list, 90 days). The note that JESTA is not yet in force rests on its absence from the official pages; the planned launch around fiscal 2028 comes from secondary news only. Vaccine recommendations are from CDC, as MZV lists none.
- **Jemen (YE):** MZV says visa only in advance at an embassy, none at the border. An official e-visa portal exists (yemenevisa.org, Aden government's Immigration, Passports and Nationality Authority), but tourist visas there are only for groups of 10+ via accredited agencies, with the sticker issued by an embassy or, for urgent visas, at the border after approval. So I kept "visa" with eta fields null. maxStayDays is null because no official figure was found. Yellow fever requirement comes from MZV; WHO 2022 and CDC say none.
- **Jihoafrická republika (ZA):** Passport rule differs by source: DHA says valid 30 days after departure and at least one blank page, MZV recommends 90 days and two blank pages - both are in passportValidity. Only minor.
- **Jižní Korea (KR):** Recorded as visa "none" because the K-ETA exemption for Czech citizens runs until 31 Dec 2026 (confirmed on k-eta.go.kr and MZV). No notice yet about 2027, so K-ETA (10,000 KRW, about 7 EUR) may become mandatory from 1 Jan 2027 and the record would then need to change to "eta". The mandatory e-Arrival Card is treated as an arrival card, not an ETA.
- **Jižní Súdán (SS):** E-visa regime read today on MZV and evisa.gov.ss, but the fee/duration table is behind a login. maxStayDays=180 comes from MZV ('platnost až 6 měsíců', fee 100-350 USD by length of stay); the standard single-entry tourist visa is probably 30 days, which I could not confirm officially. etaCostEur=89 is the lowest tier (100 USD; the South Sudan embassy in Washington lists 100 USD for Europeans). That embassy page also says the e-visa is 'temporarily suspended', which contradicts MZV and the live portal - I followed MZV.
- **Jordánsko (JO):** Recorded as "voa" with the optional MOI e-Visa in the eta fields. etaCostEur 50 is the 40 JOD single-entry visa fee confirmed for visa on arrival (ECB rate 5 Oct 2026); the exact e-visa fee was not readable on the MOI portal and a small service fee may be added. MZV visa page still says the Jordan Pass waiver needs more than 3 nights, while the official Jordan Pass site and the Czech embassy in Amman say 2 nights; I used 2. Yellow fever certificate for arrivals from risk countries comes from CDC only; MZV and the WHO 2022 list say none is required.
- **Kambodža (KH):** Choice of enum: visa on arrival and e-Visa both exist at the same price (USD 30); I chose "voa" as the normal route (all airports and land crossings) and put the optional e-Visa in etaName/etaUrl. MZV still quotes the e-Visa at 37 USD, but the official evisa.gov.kh page (last updated 1 Jan 2025) says USD 30 - I used the official figure (27 EUR at 1 EUR = 1.125 USD). Thai land border closure is taken from the MZV warning updated 14 Sep 2026.
- **Kamerun (CM):** MZV page is outdated (visa at an embassy, 'e.g. Moscow'); I used the official portal evisacam.cm FAQ instead and set it as source. maxStayDays=180 is the maximum of the short-stay visa; the actual stay is whatever is printed on the visa sticker. Polio vaccination as an entry requirement is stated only by MZV, not by WHO/CDC.
- **Kapverdy (CV):** Classification is a judgment call: I used 'eta' because the official EASE flyer says pre-registration is mandatory, but both it and MZV say the TSA fee can exceptionally be paid on arrival, so 'none' would also be defensible. Fee 3,400 CVE comes from MZV and the 2019 EASE flyer; a 2026 secondary source repeats it, I did not walk through the payment step.
- **Katar (QA):** Classification "none" vs "voa": Visit Qatar (official) returns "Enter visa-free" for Czech Republic and says visa-free is just the new name for the free visa on arrival; MZV and the Qatari embassy in Prague still call it a free visa on arrival. Passport validity conflicts: MZV says 6 months, Visit Qatar says at least 3 months (both in passportValidity). The 90-day limit comes from MZV only; the official Qatari page read today shows no number of days. Visit Qatar also asks for a confirmed hotel booking (not in notes for space).
- **Kazachstán (KZ):** Visa regime confirmed on MZV and on the Kazakh MFA table (updated 21 Aug 2026: Czech ordinary passport visa-free up to 30 days). MZV still says a migration card must be filled in on arrival; a secondary source says migration cards were abolished in January 2020, so I left it out of notes. Passport validity (6 months beyond planned stay) is from MZV only.
- **Keňa (KE):** maxStayDays=90 is the customary value; the official eTA site only says the stay is determined at the point of entry (embassy FAQ: extendable to 180 days in total). Fee: official site says 30 USD for the standard eTA, MZV says 32 USD - I used 30 USD (27 EUR).
- **Kiribati (KI):** Délka pobytu: oficiální Order 2023 (mfa.gov.ki) uvádí max. 90 dní za 12 měsíců, ale britské FCDO píše bezvízově 1 měsíc + prodloužení, takže na hranici může být razítko jen na cca 30 dní. Platnost pasu: úřad 6 měsíců ke dni odjezdu vs. MZV 3 měsíce (použito 6).
- **Kolumbie (CO):** Check-Mig: oficiální odpovědi Migración Colombia (duben a květen 2026) a zpráva z 9. 6. 2026 říkají 'no obligatorio', MZV ho uvádí jako oficiálně vyžadovaný a aerolinky ho často chtějí. Dal jsem visa=none s volitelným formulářem (cena 0). Minimální platnost pasu 6 měsíců je jen dle MZV, Migración Colombia uvádí jen 'platný pas v dobrém stavu'. Seznam zemí pro žlutou zimnici je z dokumentu Cancillería 2024 a WHO 2021.
- **Komory (KM):** Regime read on MZV today (visa on arrival in Moroni, up to 45 days, 30-60 EUR cash); French and UK foreign ministries both say about 30 EUR. No Comorian government page was found to confirm it; evisa.gouv.km, cited by some travel sites, does not resolve. Yellow fever: MZV says a certificate is required when arriving from a yellow fever country, WHO 2022 and CDC list no requirement.
- **Kongo (republika) (CG):** MZV visa.html for Kongo (Brazzaville) is empty; MZV documents.html only says passport + valid visa + vaccination card are needed. Regime, fees (1 month 110 EUR, 3 months 155 EUR) and documents were read today on ambacongo.de/demande-de-visa/ (Embassy of Congo in Berlin, lists Czech Republic in its jurisdiction; same address as MZV's listing). That site shows a WPML 'development site' banner and a different phone/e-mail than MZV lists; the German Foreign Office lists republic-congo.com as the embassy site, which confirms visa in advance via a mission, no visa on arrival, yellow fever mandatory, passport over 6 months, tourist visa 90 days - but gives no fees. maxStayDays=90 is the longer of the two visa options (base visa is 1 month). No official e-visa portal found (evisa.gouv.cg and similar hosts do not resolve).
- **Kostarika (CR):** MZV uvádí bezvízový pobyt 90 dní a platnost pasu 6 měsíců, ale oficiální stránka ICT (visitcostarica.com) a směrnice migrace z 17. 11. 2025 (1. skupina, kam patří ČR) dávají až 180 dní a pas stačí s 1 dnem platnosti. Zařazení ČR do 1. skupiny jsem přímo četl jen ve směrnici z 3/2023 a v tisku (El Financiero) ke směrnici z 11/2025, migracion.go.cr blokuje boty. Do JSON jsem dal 180 s poznámkou, že MZV uvádí 90.
- **Kuba (CU):** Cena e-víza 750 CZK pochází z MZV a z oficiální stránky velvyslanectví Kuby v Praze (7/2024), evisacuba.cu cenu neuvádí. Situace na Kubě je nestabilní: MZV od 16. 6. 2026 varuje před cestami (energie, palivo, rušené lety), podmínky se mohou rychle měnit.
- **Kuvajt (KW):** Both visa on arrival and e-Visa exist (official portal FAQ lists Czech Republic for visa on arrival); chose "voa". The 3 KWD fee (about 9 EUR) is from MZV only - the official portal says the fee is shown during the application and varies by nationality, so etaCostEur for the e-Visa is an assumption that it equals the on-arrival fee.
- **Kyrgyzstán (KG):** 30 days within 60 days is from MZV; the official Kyrgyz e-Visa portal tool confirms only "visa free regime up to 30 days" for Czech ordinary passports, and mfa.gov.kg returned 502 today. "Previously 60 days" in notes comes from secondary news sources, not an official page. MZV says longer stays need a visa from the embassy in Vienna, while the official e-Visa portal (evisa.e-gov.kg) is what I point to in notes.
- **Lesotho (LS):** 14 days visa-free comes from MZV (read today) and is confirmed by the Lesotho embassy list on lesothoemb-usa.gov.ls (Czech Republic: visa only for stays over 14 days). In May 2025 the Lesotho PM announced Cabinet approval of visa-free entry for all EU citizens, but I found no official text on implementation or on a longer stay, so 14 days was kept. evisalesotho.com (the portal MZV links) is blocked by Cloudflare (403) and homeaffairs.gov.ls says the eVisa system is suspended. Passport validity: MZV says 3 months from entry, the Lesotho embassy in the USA says 6 months for visa applicants. Yellow fever: WHO 2022 and CDC list no entry requirement, so vaccinesRequired is empty, although MZV lists yellow fever among recommended vaccinations and transit is always via South Africa.
- **Libye (LY):** Visa regime read today on MZV (visa needed; embassy in Prague, e-visa possible but MZV warns of possible border problems) and on evisa.gov.ly (Czech Republic listed as eligible, no exemption; tourist e-visa requires a registered Libyan tourism company as sponsor, passport 6 months, 1000 USD). I chose visa="visa" because MZV names the embassy first; "evisa" would also be defensible. The e-visa fee is NOT published on the official portal - etaCostEur 56 (63 USD) comes from secondary sources only. Length of stay is not stated officially (secondary sources: 30 days), so maxStayDays is null. Yellow fever: MZV says certificate needed when arriving from risk countries, WHO ITH 2022 lists no requirement.
- **Libérie (LR):** Classified as evisa although the official name is 'Visa on Arrival': online pre-application and payment (USD 102.5) are mandatory and the sticker is issued only at Roberts Airport (ROB). The portal says applicants from a country with a Liberian embassy must apply at that embassy; Czechia has none and MZV points Czech citizens to the portal, but I did not read the embassy list itself (it links to a third-party site). maxStayDays=30 is the lower of the two options (officer grants 30 or 90 days). Yellow fever sources disagree: MZV says mandatory, UK FCDO says a certificate is needed for the visa application, WHO 2022 and CDC say only when arriving from a risk country. EUR cost converted at 0.8925 EUR/USD (5 Oct 2026).
- **Madagaskar (MG):** Conflict between sources: MZV (and gov.uk) still say stays up to 15 days need no visa, only a 10 EUR fee; the official portal evisamada-mg.com shows a tariff effective 16 Feb 2026 where 1-15 days costs 30 EUR / 35 USD (16-30 d 35 EUR, 31-60 d 40 EUR, 61-90 d 50 EUR), same price online and on arrival. I trusted the official portal. visa="voa" chosen (e-visa is optional); etaCostEur 35 is the 30-day tier. The portal says the only official site is evisamada.gov.mg, but that domain has a broken TLS certificate and its http version redirects to evisamada-mg.com (the URL MZV links), so I used evisamada-mg.com as etaUrl. maxStayDays 60 (e-visa max; extension to 90 per MZV).
- **Malawi (MW):** Visa requirement and eligibility verified on evisa.gov.mw (wizard: Czechia needs a visa; official PDF lists Czechia as Category Two = visa on arrival allowed since 24 Feb 2026). Fee discrepancy between official pages: evisa.gov.mw FAQ and MZV say single entry 50 USD, the older immigration.gov.mw fee page says 75 USD; I used 50 USD (45 EUR at ECB 1.1204). maxStayDays 30 (extendable to 90) comes from the Malawi High Commission in Tanzania site, not from the e-visa portal, which only says the single-entry visa is valid 3 months. Date of the visa reinstatement (3 Jan 2026) is from a secondary source only and is not in the record.
- **Mali (ML):** MZV only says passport + visa and that the competent embassy is in Rome. Details (appointment/online request via diplomatiemdc.gouv.ml, 110 EUR for a 3-month multiple-entry visa, passport 6 months, yellow fever certificate) read on the Mali embassy in Rome site and the official portal (its checker returned 'Un visa vous est requis' for Czech nationality, mission = Rome). Unclear whether the visa is delivered electronically (a tour operator article describes an emailed 'Autorisation d'entree') or the passport must be presented in Rome; I kept visa="visa" with eta fields null. maxStayDays 90 is the visa validity, not an explicitly stated length of stay.
- **Maroko (MA):** Minor: MZV is internally inconsistent on passport validity (visa page: at least 3 months from entry; documents page: valid for the stay). I used the stricter 3 months. The Moroccan consular site (consulat.ma) lists the Czech Republic as visa-exempt without the AEVM mark; the 90-day limit is from MZV.
- **Mauricius (MU):** Minor: yellow fever. WHO ITH 2022, CDC and MZV all say no certificate is required, so vaccinesRequired is empty, but UK FCDO-type sources and the older WHO 2013 list say a certificate is needed when arriving from a risk country. 90-day limit is from MZV; the Mauritian immigration page only confirms EU passports are visa-exempt (its country-wise PDF was not readable).
- **Mauritánie (MR):** Regime verified on MZV (e-visa mandatory since 5 Jan 2025, 55 EUR / 60 USD paid in cash at the border; UK FCDO confirms cash on arrival). The official ANRPTS portal now shows 30 / 90 / 360-day packages and mentions a 'payment stage' but displays no prices, so I could not confirm on the Mauritanian site whether the fee differs by duration or whether online payment has been introduced. maxStayDays set to 30 (standard visa); 90-day multi-entry exists.
- **Mexiko (MX):** Přímo jsem četl jen MZV (visa, documents, health). Oficiální mexické stránky (embamex, INM) blokuje CAPTCHA, takže 180 dní, platnost pasu a digitální FMM jsem nemohl potvrdit na straně Mexika. Délku pobytu určuje úředník ručně.
- **Mosambik (MZ):** Visa regime is verified (official portal evisa.gov.mz lists Czech Republic only under eVisa, not under eTA or visa-exempt; MZV agrees), but the fee is NOT published on the official portal without starting an application. etaCostEur 170 (about 190 USD for 30 days) comes only from secondary sources (tragento, wego, safarifind); Wikipedia still quotes the older 6,250 MZN tariff. MZV also still mentions visas issued at selected border crossings, which the new portal does not confirm. maxStayDays set to 30 as the standard product; 60 and 90 days are also offered.
- **Namibie (NA):** Chose 'evisa' because the Namibian ministry recommends applying online before travel (per German Foreign Office page dated 05.10.2026 and the ministry fact sheet), but visa on arrival at main ports of entry remains a fully valid route, so 'voa' would also be defensible. The official portal eservices.mhaiss.gov.na sits behind a human-verification wall and could not be read directly; the 1,600 NAD fee comes from the ministry fact sheet (2025), the Namibian embassy in Berlin and UK FCDO, and is 'subject to annual review' - no 2026 change found. EUR value (85) converted at about 18.75 NAD/EUR.
- **Nauru (NR):** Vízum a 30 dní potvrzuje MZV (dnes načteno). Nauru.gov.nr uvádí jen žádost e-mailem na Naoero Immigration, bez poplatku a délky pobytu. MZV uvádí konzulát v Melbourne nebo zastoupení ve Fidži. Poplatek (cca 100 AUD) jsem nenašel na žádné oficiální stránce, proto je etaCostEur null. Nauru má v minulosti vydávání víz pozastavovalo.
- **Niger (NE):** MZV only says visa from an embassy (e.g. Berlin); no length of stay or fee given, so maxStayDays is null. In August 2025 Niger restricted visa issuance for German, Italian, Dutch, Belgian and British citizens to Geneva/Ankara/Moscow (press reports, not official page); Czechs are not listed but it is unconfirmed whether the Berlin embassy still serves them. No working official e-visa found. Passport 6-month remark is from secondary sources, MZV says only 'valid passport'.
- **Nigérie (NG):** E-visa fee for Czech citizens not confirmed on an official page (NIS portal shows fees only after login). etaCostEur 257 = 288 USD (88 visa + 170 biometric + 30 bank charge) reported by a secondary source (Mondaq fee table) for DE/FR/IT/ES; Czech Republic is not in that table. Regime itself (e-Visa F5A, single entry, 30 days, passport 6 months) read on immigration.gov.ng today. Yellow fever: MZV says mandatory for all, WHO 2022 list says only from risk countries. MZV says passport 3 months beyond departure, NIS says 6 months.
- **Nikaragua (NI):** Weby DGME/MINT (migob.gob.ni, mint.gob.ni) blokuje Cloudflare, nepřečetl jsem je přímo. Nejistá je předregistrace formulářem 7 dní předem: DGME ji podle vyhledávače jen doporučuje, MZV ji požaduje jen pro NGO, La Prensa (6/2026) píše, že musí všichni cizinci. Bezvízový režim 90 dní potvrzen přes MZV, UK FCDO a kanadské vládní stránky.
- **Palau (PW):** MZV a dohoda EU–Palau (platná od 8. 12. 2015) dávají 90 dní za 180, ale oficiální turistický web Palau uvádí pro ostatní státy standardně jen 30denní povolení při příletu (prodloužení 2× 50 USD). Do souboru jsem dal 90 s poznámkou. Povinnost formuláře Palau Entry Form potvrdil živý web palautravel.pw, ale informační stránky turistického úřadu jsou z roku 2023.
- **Panama (PA):** Platnost pasu: oficiální turistický web a velvyslanectví Panamy uvádějí 3 měsíce, MZV 6 měsíců. Žlutá zimnice: CDC ji stále uvádí jako povinnou z rizikových zemí, panamský turistický web ji označuje za již nepovinnou (Panama si ji může vyžádat). Bezvízový režim 90 dní je ověřen.
- **Papua-Nová Guinea (PG):** MZV píše jen o vízu na zastupitelském úřadu a o zákazu víz na letišti. Portál ICA (načtený 5. 10. 2026) ale uvádí Česko v seznamu pro online Easy Visitor Permit 60 dní, bez MSF, s poplatkem 50 USD. Praktické schválení pro české občany jsem nezkoušel. Stránka ICA 'Visitor Visa' zároveň naznačuje, že eVisa je určena zemím z VoA seznamu, ve kterém Česko není. Cena v EUR je přepočet 50 USD.
- **Paraguay (PY):** Weby migraciones.gov.py a mspbs.gov.py se nepodařilo načíst (DNS chyba), takže požadavek na očkování proti žluté zimnici (Res. MSPBS 268/2025, seznam zemí) je jen z výsledků vyhledávání a tisku (Última Hora 9. 1. 2026). Platnost pasu oficiálně neověřena (uvedeno jen 'dle platnosti pasu'). ČR jako bezvízová potvrzena na stránce MRE a MZV.
- **Peru (PE):** Délka pobytu: MZV a peru.travel uvádějí 90 dní bez prodloužení, Migraciones a RREE až 183 dní dle uvážení úředníka. ČR v oficiálním seznamu RREE (PDF z 24. 11. 2025) jsem přímo nenašel, protože PDF vrací 403; bezvízový režim vychází z MZV a obecného textu RREE ('některé země Evropy').
- **Pobřeží slonoviny (CI):** Regime verified on MZV and snedai.com (live today). maxStayDays 90 is derived from the stated visa duration '3 mois (multiple-entrées)'; MZV 'other' page still contains an older sentence strongly discouraging tourism, while the current MZV warning (10.4.2025) only warns against the north-east and border areas.
- **Rovníková Guinea (GQ):** Official e-visa portal (equatorialguinea-evisa.com, run by VFS Global for the government) does not state the length of stay, so maxStayDays is null; secondary sources say 30 days stay / 90 days validity, UK FCDO says short-term visas valid 90 days. MZV page is outdated (mentions only embassies in Madrid/Paris/Berlin). Portal is internally inconsistent on passport validity (6 months vs 30 days on one page); 6 months used. Yellow fever: portal requires the certificate for the application and at entry, WHO/CDC list it as required only from risk countries. Fee 50 + 25 USD excludes taxes.
- **Rwanda (RW):** Regime verified (visa on arrival for all nationalities, 50 USD single entry 30 days, on migration.gov.rw and MZV). Minor: the Irembo deep link from migration.gov.rw redirects to the all-services page, so etaUrl is the portal's service list (same link MZV uses). Ebola entry ban taken from the MZV warning (updated 11.6.2026); the RDB public notice PDF could not be read (image PDF), a secondary source describes quarantine rather than a ban.
- **Salvador (SV):** Délka pobytu: MZV uvádí 90 dní, oficiální prohlášení prezidenta (13. 1. 2023), UK FCDO a Kanada uvádějí 180 dní; zapsáno 180 (v CA-4 se sčítá 90). Web DGME/RREE nečitelný (403 nebo neúplný seznam), takže není ověřeno, zda se občanům ČR vybírá turistická karta 12 USD.
- **Senegal (SN):** Visa-free 90 days confirmed today on MZV, German Auswaertiges Amt (Stand 05.10.2026) and France Diplomatie (updated 29.09.2026). Two open points: (1) passport validity - MZV says 3 months after planned return, DE and FR say 6 months; (2) Senegal's Council of Ministers adopted a reciprocity e-visa plan on 30.07.2025 that would cover EU citizens - no official page shows it in force yet, but it could start at short notice.
- **Seychely (SC):** Minor conflict on passport validity: the official Seychelles Electronic Border System FAQ and UK FCDO say valid for the duration of stay, MZV says 6 months after planned departure plus 2 free pages. Both are stated in the record. Recommended vaccines are general knowledge (MZV lists none).
- **Sierra Leone (SL):** Minor: MZV words the health declaration as 'at the latest 72 hours before travel', while the official portal poep.npha.gov.sl says it must be filled 'not more than 72 hours before' travel - the record follows the official portal. Visa-on-arrival option (80 USD cash) comes from UK FCDO, not from MZV. Passport validity: MZV says 6 months after departure, the e-visa portal 6 months from entry.
- **Somálsko (SO):** Regime (eTAS, 64 USD, max 30 days, passport 6 months) read today only on MZV; the official portal etas.gov.so returns a Cloudflare 403 to both WebFetch and the Chrome helper, so fee and length of stay are not confirmed on the Somali site itself. The Immigration and Citizenship Agency site (immigration.gov.so) confirms etas.gov.so as the official portal and mandatory use since 01.09.2025. Classified as 'evisa' (ICA calls it Electronic Visa / eTAS; MZV calls it a travel authorisation). UK FCDO additionally warns of a data breach in the eVisa system and says an invitation letter may be required. Somaliland has a separate visa-on-arrival regime.
- **Středoafrická republika (CF):** Visa regime (embassy visa in Paris, passport, yellow fever for all) read today on MZV and UK FCDO, but no official page gives the length of stay or the fee, so maxStayDays is null. The embassy website MZV links to (amb-rcaparis.org) is no longer an embassy site (now an unrelated blog). No official e-visa found. Passport validity of 6 months comes from FCDO; MZV says only 'valid passport'.
- **Surinam (SR):** Klasifikace 'eta' je výklad: formálně jde o bezvízový vstup s povinným Entry Fee (voucher při odbavení) a povinným formulářem ICF. etaCostEur=50 neobsahuje servisní poplatek VFS 8 EUR; MZV uvádí zastaralých 25 EUR.
- **Svatá Lucie (LC):** Online imigrační formulář: portál a MZV ho označují jako potřebný, turistický úřad stlucia.org jen jako 'strongly encouraged' a nutný k nástupu do letadla není. Platnost pasu: MZV uvádí 6 měsíců, oficiální web 'po dobu pobytu'. Seznam bezvízových zemí z External Affairs je z roku 2018 (Česko 90 dní/180).
- **Svatý Kryštof a Nevis (KN):** Délka bezvízového pobytu: MZV uvádí až 6 měsíců, oficiální web eTA říká, že délku pobytu určuje imigrační úředník, dohoda EU a Wikipedie 90 dní, velvyslanectví KN 'zpočátku jeden měsíc'. Do souboru jsem dal konzervativních 90 dní. Také oficiální FAQ portálu eTA tvrdí, že očkování se nevyžaduje, zatímco MZV a WHO uvádějí povinnou žlutou zimnici při příjezdu z rizikové země.
- **Svatý Tomáš a Princův ostrov (ST):** 15-day visa-free regime confirmed on MZV, Portuguese MNE (updated 25.2.2026) and FCDO. Unclear: FCDO says a 20 EUR entry fee is paid on arrival, while the Dec 2024 airport-fee increase (incl. a 20 EUR regulation fee) was reported annulled in Jan 2025 (news, secondary) - mentioned in notes as an FCDO claim only. Passport validity differs: MZV and Portuguese MNE 6 months, FCDO 'duration of stay'. Yellow fever: MZV calls it compulsory, WHO/CDC/Portugal only when arriving from a risk country.
- **Svatý Vincenc a Grenadiny (VC):** Délka pobytu je v oficiálních zdrojích rozporná: imigrace (MNS) a MZV uvádějí pro státy Schengenu 6 měsíců, MFA SVG uvádí 90 dní za 6 měsíců (dohoda EU). Zapsáno 90 dní. Online formulář na vctedcard.caricomimpacs.org je na portálu označen jako 'UAT Version', takže jsem neověřil, že je v praxi povinný (portál říká 'Travellers are required'). Oficiální web neuvádí požadavek na platnost pasu.
- **Súdán (SD):** Embassy visa confirmed today on MZV, German Auswaertiges Amt and FCDO, but length of stay is not stated anywhere official (maxStayDays null). Yellow fever sources conflict: MZV, WHO 2022 list and CDC say no certificate required; FCDO says it is required - I recorded the conflict in vaccinesRequired. MZV text is partly dated (7-day registration vs 3 days on AA/FCDO; says Khartoum and Port Sudan airports are closed, AA says Port Sudan has limited regional flights). Third-party sites claim a Sudanese e-visa; I found no official portal, so not used.
- **Tanzanie (TZ):** Regime confirmed on MZV and Tanzanian immigration site. Chosen 'evisa' because immigration recommends online application; visa on arrival still available (in notes). Mainland insurance rule is only days old (from 1.10.2026), so practice at the border may still vary. EUR amount is an approximate conversion of 50 USD (rate about 0.89, same as sibling chunks).
- **Togo (TG):** E-visa and prices read today on the official Togo Voyage portal. maxStayDays 90 is the top tourist tier (65 000 CFA); etaCostEur 38 is the cheapest tier (1-15 days single entry, 25 000 CFA). Yellow fever: MZV, WHO and CDC say required for all travellers, but the new Togo portal now says a yellow fever card is only 'recommended' and its old FAQ says only from risk countries - I kept 'required for all'.
- **Trinidad a Tobago (TT):** Délku pobytu (90 dní/180) a platnost pasu (více než 6 měsíců od odjezdu) jsem četl jen na MZV a v dohodě EU o bezvízovém styku. Oficiální seznam TT bezvízových zemí EU neobsahuje a PDF 'Visa Requirements for all Countries' vrací 404. Aktuální stav výjimečného stavu v říjnu 2026 jsem neověřil, k dispozici byly jen zprávy z března 2026.
- **Tunisko (TN):** The visa regime was read on MZV only; I found no working Tunisian government page (discovertunisia.com/en/formalities returned 404). The MZV visa page does not mention ID cards; 'passport only' comes from the MZV documents page (saved copy from the earlier run today), supported by a secondary report that ID cards stopped being accepted on 1 Jan 2025. MZV says no vaccination is compulsory, while the WHO list requires a yellow fever certificate for arrivals from risk countries; I recorded the WHO condition.
- **Tuvalu (TV):** Délka pobytu a poplatek. MZV, AA a dohoda EU–Tuvalu uvádějí 90 dní za 180, ale zákon Tuvalu (Immigration Regulations 2014, kopie z gov.tv) dává povolení při příletu max. 30 dní, prodloužení po 30 dnech za 100 AUD. Poplatek 100 AUD platí pro země mimo Schedule 1, kde ČR není (seznam je z doby před dohodou s EU). Domény *.gov.tv se nepodařilo načíst (DNS), takže jsem je četl jen z kopie na archive.org a z PacLII. Ponechal jsem 90 dní a v poznámce upozorňuji na 30 dní.
- **Uganda (UG):** Yellow fever sources conflict. The Ugandan immigration authority (NCIC, immigration.go.ug/node/254, notice dated 2 Oct 2026, read today) says the certificate is no longer mandatory for entry. MZV documents.html still says it is required from everyone (Ministry of Health 2020), CDC (page dated Apr 2025) says required for all travellers aged 1+, and the saved WHO list says only for arrivals from risk countries. NCIC's own East African Tourist Visa page still lists a yellow fever certificate as an attachment. I recorded the new notice and kept the vaccine as recommended. Separately, the MZV Ebola warning (updated 21 Jul 2026) says the DRC border is closed; a secondary source says the outbreak was declared over on 27 Aug 2026, so the border status may be out of date.
- **Vanuatu (VU):** Délka pobytu: MZV a AA uvádějí 90 dní za 180, oficiální web imigračního úřadu Vanuatu (turistické vízum při příletu pro osvobozené země) a Vanuatu Tourism Office uvádějí až 120 dní bez prodloužení. Ponechal jsem konzervativních 90 dní a 120 uvádím v poznámce. Seznam osvobozených zemí na webu úřadu je chaotický: ČR je v záložce 'Africa and Others', některé země jsou v obou seznamech.
- **Venezuela (VE):** Situace je nestabilní (MZV varování aktualizované 26. 6. 2026, zemětřesení 24. 6. 2026, omezený letový provoz). Bezvízový režim do 90 dní a nutnost pasu jsem potvrdil na MZV a v německém AA (stav 6. 10. 2026), na stránkách venezuelské vlády (mppre.gob.ve, SPA) se to ověřit nepodařilo. E-visa portál od 4/2026 se týká národností s vízovou povinností (zdroj EY/KPMG, ne oficiální stránka).
- **Zambie (ZM):** The 90 days per 12 months limit and the extension needed after 30 days come from MZV only. The Zambian immigration site confirms Czech Republic is visa-exempt and requires a return ticket, but gives no length of stay. Blank passport pages differ: Zambian immigration says 3, MZV says 2; I used 3 and noted the MZV figure.
- **Zimbabwe (ZW):** The fees (30 USD single entry, 45 USD double entry) come from the MZV page only. I could not read a fee table on a Zimbabwean government site: the evisa.gov.zw brochure PDF returns 403 and zimimmigration.gov.zw lists no prices, so etaCostEur 27 assumes the e-visa costs the same as the visa on arrival. I chose 'voa' because Czech Republic is in Category B (visa obtainable at the port of entry) on zimimmigration.gov.zw and evisa.gov.zw, although the authorities 'encourage' applying for the e-visa in advance. The KAZA Univisa price (50 USD) was read on the Zambian immigration site, not a Zimbabwean one.
- **Ázerbájdžán (AZ):** Current e-visa fee could not be read on evisa.gov.az (Cloudflare 403 in WebFetch and in the browser helper). Official sources disagree: MZV visa page 25 USD, Czech embassy Baku 23 USD (page updated 16.05.2025), Azerbaijani embassy pages 20 USD state fee; unofficial 2026 sources say 26 USD (20 + 6 service). etaCostEur=22 is based on 25 USD at ECB 1 EUR = 1.1204 USD. Whether land borders reopen after 2 Jan 2027 is unknown.
- **Írán (IR):** MZV (read today) says tourist visas since August 2025 are issued only for tours organised by Iranian travel agencies; secondary sources claim this was relaxed in autumn 2025, which I could not confirm on an official page. maxStayDays is null because official Iranian embassy pages disagree (Oslo: max 45 days, Canberra: 90 days) and the Prague embassy page gives no figure. The fee for Czech applicants was not found. I filled etaName/etaUrl with the Iranian MFA online application portal even though visa is 'visa' (the visa itself is issued by the embassy) - set them to null if the merge expects that. The MZV link evisatraveller.mfa.ir/en/ returns 404; evisa.mfa.ir/en/ works.
- **Čad (TD):** Regime read today on the official portal evisa.td (all visas exclusively online since 11 May 2026; Czechia not on the exempt list; yellow-fever proof checked on arrival). MZV visa page is outdated (still says embassy in Moscow), France Diplomatie (15 Sep 2026) and UK FCDO also still say embassy. The fee and length of stay are NOT on the official site: etaCostEur 70 (30 days single entry; 100 EUR for 90 days multiple entry) comes only from secondary sources (visasnews, an agency page) and may predate the new May 2026 tariff grid; maxStayDays left null (secondary sources say visas are issued for 15/30/90 days). Passport validity 6 months is from UK FCDO, MZV gives no figure. Yellow fever: MZV and evisa.td say required for all, WHO 2022 / CDC say only when arriving from a risk country.
- **Čína (CN):** Visa requirement verified on MZV (page updated for Sept 2026) and Chinese embassy in Prague (visa fee notice). maxStayDays left null because the stay depends on the issued visa (240-hour transit is the only visa-free option). The 1 100 CZK is the embassy fee only; visa-centre service fee not checked. Unilateral visa-free list expires 31 Dec 2026 and could change for 2027.
- **Šalomounovy ostrovy (SB):** Od 6. 9. 2026 běží nový e-visa systém. Web imigračního úřadu (immigration.gov.sb/mutual-visa-eu) pro EU nabízí online 'Mutual Reciprocal Visa Exemption' (zdarma, 90 dní, grant letter při vstupu, apply 'outside Solomon Islands'). Portál ji ale řadí do třídy Special Exemption s dopisem ministerstva či organizace, takže jde nejspíš o služební cesty. Pro bezvízový vstup turistů z EU svědčí MZV, AA (stav 6. 10. 2026), Tourism Solomons, EU dohoda a Legal Notice 128/2025, kde je Česká republika mezi 'concessional entry arrangement countries'. FCDO a tisková zpráva vlády z 7. 9. 2026 uvádějí počáteční pobyt 30 dní. Ponechal jsem visa 'none' a 90 dní. Žádný oficiální zdroj výslovně nepotvrzuje, že turista z EU nic předem žádat nemusí, ani zda razítko při příletu bude na 30 nebo 90 dní.

## Novinky a zvláštnosti zachycené při rešerši (204)

V původním znění agentů (česky nebo anglicky).

- Benin: Ministry of Health notice posted 16 Sep 2026 on evisa.bj - vaccination cards (incl. yellow fever) are no longer checked at points of entry; vaccination remains recommended. WHO/CDC/MZV still list it as required.
- Angola: visa portal moved from smevisa.gov.ao to evisa.ao (old URL redirects; secondary source ATTA dates the announcement 27 Aug 2026, with online fee payment). Not needed by Czech tourists, who stay visa-free 30 days per entry / 90 per year.
- Angola: Presidential Decree 193/25 of 17 Oct 2025 added the Philippines to the tourist visa-exemption list; the regime for Czech citizens is unchanged.
- Burkina Faso: official fee table now shows a separate tourist visa at 33 000 F CFA single / 55 000 multiple entry and a new 'AES visa' tab; secondary sources report visa fees dropped for all African passport holders (not relevant to Czech citizens).
- Burkina Faso: MZV warning (updated 23 Jan 2025, still listed) recommends only essential travel - terrorism and kidnappings.
- Algeria: still embassy visa only; e-visa announced but not launched. Visa on arrival for Saharan-south trips via approved agencies (since 2023) was reported under review in July 2026 (secondary source). Czech embassy warning of 20 Jan 2025 on attacks and kidnappings of European tourists in Djanet / Tamanrasset.
- Botswana: no 2025-2026 change found for Czech citizens; visa-free up to 90 days per year.
- Ghana: official e-Visa portal evisa.immigration.gov.gh launched 25 May 2026 (Ghana MFA); Czech citizens need an eVisa - USD 260 standard (96 h), 338 priority, 442 express; single entry, valid 90 days from issue, stay max 60 days; African passport holders get a free ETA
- Guinea: e-visa fee on the official DCPAF portal is now USD 100 (previously USD 80); reportedly from 1 Aug 2026 EU citizens face 45-day processing and no multiple-entry visas as reciprocity for EU Schengen restrictions (secondary source only)
- Guinea: MZV page still says visa at the embassy in Berlin, but the official portal and German AA require the online e-visa (paf.gov.gn/visa)
- Guinea-Bissau: former e-visa site rgb-visa.com now carries casino spam links and must not be linked; military takeover on 26 Nov 2025, elections announced for 6 Dec 2026 (AA / France Diplomatie)
- Guinea-Bissau: MZV health page says yellow fever is not mandatory from Europe, while WHO, CDC, German AA and UK FCDO state it is mandatory for all travellers from 1 year
- Gambia: Gambia Immigration Department explicitly lists Czech Republic among visa-exemption countries; Securiport fee of 1000 GMD / 20 USD is charged in cash on both arrival and departure at Banjul airport
- ECB reference rate used for conversions on 2026-10-05: 1 EUR = 1.1204 USD (USD 260 = 232 EUR, USD 100 = 89 EUR)
- Egypt: visa-on-arrival / single-entry e-Visa fee raised from 25 to 30 USD from 1 March 2026 (MZV and Cairo embassy page; visa2egypt.gov.eg FAQ shows 30 USD single, 65 USD multiple)
- Ethiopia: new MZV warning published 29 Sep 2026 (updated 1 Oct 2026) against travel to Tigray, Amhara and Afar due to armed clashes and closed airports; other regions outside Addis Ababa only if essential
- Ethiopia: e-Visa 62 USD / 30 days confirmed on evisa.gov.et; MZV warns overstay fines of 3000 USD flat plus 30 USD per day
- Gabon: official e-Visa portal evisa.dgdi.ga operating (70 + 15 EUR, Libreville airport only); press reports (EY 5 Dec 2025, visasnews) of online payment rollout in Dec 2025 and a free tourist e-visa promotion in Jul-Sep 2025; MZV page not updated and still lists embassy visa only
- Gabon: yellow fever vaccination required for all travellers from 9 months of age (WHO, CDC Apr 2025, MZV)
- Eswatini: e-visa portal evisa.gov.sz reportedly launched Aug 2025 for visa-required nationalities (secondary sources, site unreachable today); Czech citizens remain visa-free for 30 days
- Eritrea: no regime change; embassy visa only, 50 EUR, up to 4 weeks, approval from Asmara (Berlin embassy site, news dated Aug 2026); MZV travel recommendation last updated 11 Apr 2025
- ECB reference rate used for conversions: 1 EUR = 1.1204 USD on 2026-10-05
- ZA: from 1 July 2026 every traveller must submit the SARS online Traveller Declaration (customs, free, no earlier than 24 h before departure); entry is not refused solely for missing it (sars.gov.za FAQ)
- ZA: Electronic Travel Authorisation officially launched 12 Aug 2026 (eta.dha.gov.za) - compulsory only for visa-required nationalities, voluntary for visa-exempt travellers such as Czechs; 90-day visa exemption confirmed on DHA list issued 9 Dec 2025
- CV: from 1 Jan 2026 nationals of 91 listed countries need a visa before arrival (no more visa on arrival) - Czech Republic is not on the list, EU citizens stay visa-free for 30 days with EASE pre-registration and TSA 3,400 CVE (about 31 EUR)
- KE: 'Kenya Citizenship and Immigration (Amendment) Rules, 2025' exempt most African and some other countries from the eTA; Czechia still 'ETA required', standard eTA 30 USD, one-year multi-entry eTA 300 USD
- CM: all visa applications only online at evisacam.cm (153 EUR short stay, 229 EUR express); travellers from countries without a Cameroonian mission get the visa sticker on arrival with the online authorisation - MZV page still describes embassy visas
- SS: MZV warning against all travel updated 21 July 2026 (threat of civil war, airspace may close without notice; Ebola-related entry restrictions elsewhere for people who were in South Sudan)
- Exchange rate used: ECB reference 5 Oct 2026, 1 EUR = 1.1204 USD
- Kyrgyzstan: from 1 Jan 2026 the visa-free stay for Czech citizens is 30 days within a 60-day period, no registration (Cabinet resolution No. 855 of 31 Dec 2025 per news reports; previously 60 days). MZV page already reflects it.
- Qatar and Kuwait: MZV warning published 1 Mar 2026, updated 24 Jun 2026 and still in force on 5 Oct 2026 - travel only when strictly necessary because of the escalation of the conflict with Iran; transit possible.
- Cambodia: MZV recommendation updated 14 Sep 2026 - land border with Thailand closed since 24 Jun 2025 (ceasefire 27 Dec 2025, border zone within 30 km still to be avoided, unexploded ordnance); border temples such as Preah Vihear closed.
- Cambodia: e-Arrival (arrival.gov.kh, free, within 7 days before arrival) is required of all travellers including visa holders; since July 2025 an emailed v-Pass replaces the passport entry stamp. MZV says it is enforced at airports and seaports, not yet at land crossings.
- Cambodia: official tourist e-Visa fee is USD 30 (reduced from 36 on 1 Jan 2025); e-Visa entry via Poipet and Cham Yeam is temporarily suspended, accepted at Techo (KTI), Siem Reap and Sihanoukville airports plus Bavet and Tropaeng Kreal.
- Kuwait: e-Visa issuance resumed on the Ministry of Interior portal kuwaitvisa.moi.gov.kw; visa on arrival at Kuwait airport remains for Czech citizens (stay up to 90 days).
- Kazakhstan: no change for Czech tourists - 30 days visa-free per entry, max 90 days in 180; MFA visa-regime table last updated 21 Aug 2026.
- Qatar: official wording changed - the former free visa on arrival is now called visa-free entry (Visit Qatar: nothing changed except the name).
- Yellow fever requirements (KH, QA, KZ: certificate when arriving from a risk country; KW, KG: none) come from the saved WHO list dated 2022, not a 2026 edition; recommended vaccines are general knowledge, not read on an official page today.
- Israel: ETA-IL mandatory since 1 Jan 2025; 25 ILS (about 7 EUR), valid 2 years, up to 90 days per visit (PIBA and MZV).
- Israel: MZV advisory (published 1 Mar 2026, updated 24 Jun 2026) recommends travel only when strictly necessary due to the escalation with Iran.
- Jordan: same MZV advisory level (published 1 Mar 2026, updated 24 Jun 2026) - travel only when strictly necessary.
- Jordan: Jordan Pass visa-fee waiver now needs a minimum of 2 nights (official Jordan Pass site); MZV visa page still shows the older 3-night rule. Visa on arrival remains 40 JOD, valid 1 month.
- South Korea: K-ETA exemption for Czech citizens extended for 1 Jan - 31 Dec 2026 (official notice dated 23 Dec 2025); nothing published yet for 2027.
- South Korea: since 1 Jan 2026 the arrival card is electronic only (free e-Arrival Card, submitted within 72 hours before arrival) for travellers without K-ETA (MZV; e-arrivalcard.go.kr).
- South Korea: Czech citizens can use automated e-gates at Incheon after on-site biometric registration since 1 Dec 2025 (MZV).
- Yemen: MZV warning against all travel including Socotra, updated 22 Sep 2026; all EU embassies closed.
- Yemen: e-visa portal launched June 2025 (per secondary sources), but tourist visas only for agency-organised groups of 10+; individual tourists still need an embassy visa.
- Japan: no change for Czech citizens - 90 days visa-free (MOFA list dated 1 Sep 2025); no ETA required as of Oct 2026.
- Chad: since 11 May 2026 all visa applications exclusively online via the official portal evisa.td; visas issued outside the platform invalid after 21 May 2026 (official notice on evisa.td). MZV page still says embassy in Moscow.
- DR Congo: MZV issued on 1 Oct 2026 a warning against all travel and a call for Czech citizens to leave the country (escalating conflict plus Ebola Bundibugyo outbreak in Ituri, North/South Kivu, Haut-Uele, Tshopo, Bas-Uele, Sud-Ubangi); CDC has Level 4 / Level 3 Ebola notices.
- DR Congo: official e-visa portal evisa.gouv.cd is live ('visa volant': 300 USD + 90 USD airport visa valid 7 days, extendable), but MZV and the Czech embassy in Kinshasa still direct Czech citizens to the DRC embassy in Prague.
- Djibouti: official e-visa platform moved to a new system at evisa.gouv.dj/applicant-api (old-platform applications handled by e-mail); official FAQ fees 12 USD (1-14 days) / 23 USD (15-90 days), single entry, no visa at the airport. MZV warning (updated 11 Apr 2025) against travel near the Eritrean border.
- Burundi: official CGM site migration.gov.bi (2026) offers an online 'Visa d'entrée aéroport' application; 1-month entry visa 90 USD (about 80 EUR). MZV mpox recommendation (updated 25 Jun 2025) lists Burundi and DR Congo.
- Chad: France Diplomatie reports a cholera epidemic alert in N'Djamena (25 Jul 2026); MZV advises only essential travel and avoiding the south, north, Lake Chad and border areas.
- EUR conversion used ECB reference rate of 5 Oct 2026: 1 EUR = 1.1204 USD.
- CN: Czech Republic is still NOT in China's unilateral 30-day visa-free scheme (extended for ~45 countries to 31 Dec 2026, Sweden added 10 Nov 2025) - Czech tourists need a visa; only the 240-hour visa-free transit applies
- CN: online arrival card (NIA) available since 20 Nov 2025; new Exit-Entry Administration regulation in force from 15 Sep 2026 (MZV); reduced visa fee 1 100 CZK for Czech citizens extended to 31 Dec 2026 (Chinese embassy in Prague)
- GE: from 1 Jan 2026 all tourists must hold health and accident insurance with cover of at least 30 000 GEL, checked at the border (geoconsul.gov.ge, MZV); visa-free 1 year and ID-card entry unchanged; MZV security warning updated 14 Sep 2026 (avoid protests)
- BT: discounted SDF of 100 USD per person per night is valid until 31 Aug 2027 (standard 200 USD); e-visa 40 USD via immi.gov.bt, tourist stay max 90 days; official Bhutan pages no longer list travel insurance as a visa requirement although MZV still says it is mandatory
- PH: no change - 30 days visa-free, mandatory free eTravel registration (official site warns about paid fake sites)
- BN: no change - 90 days visa-free (Brunei MFA Category D1), mandatory online E-Arrival Card via imm.gov.bn
- AZ: land borders still closed to travellers - the COVID 'special quarantine regime' was extended again on 17 Sep 2026 until 2 Jan 2027 (Azertag, read today); entry only by air, Czech embassy Baku says land/sea crossings are open only with a special permit.
- BH: MZV advisory published 1 Mar 2026, updated 13 Mar 2026 and still listed on 5 Oct 2026 - travel to Bahrain only when strictly necessary because of the escalation of the conflict with Iran.
- AF: a tourist e-visa portal (eafghans.com, authorized by the Afghan Consulate General in Dubai) reportedly launched in March 2026 - 30 days, single entry, Kabul airport only, Czech Republic selectable; MZV still lists embassy visas only and warns against all travel (warning updated 10 Apr 2025).
- BD: visa on arrival was reportedly suspended 15 Jan - 15 Feb 2026 around the elections (secondary source pasazer.com); a draft 'Visa Policy 2026' with e-visa provisions has been under ministerial review since July 2026 and is not in force (secondary source visasnews.com citing BSS).
- BD: Bangladesh embassy Berlin fee table lists a single-entry visa for Czech citizens at 25 EUR, processing minimum 3 weeks, passport must be sent in.
- AM: no change found - 180 days visa-free per year, passport only (no ID card), confirmed on MZV, Czech embassy Yerevan and mfa.am today.
- Conversions used ECB reference rate of 5 Oct 2026: 1 EUR = 1.1204 USD (10 BHD is about 24 EUR, 25 USD about 22 EUR).
- India: official e-Tourist visa fee table dated 08-Sep-2026 - Czech citizens pay 25 USD for 30 days (10 USD April-June), 40 USD for 1 year and 200 USD for 5 years, plus 3 % bank charge.
- India: e-Arrival Card mandatory for foreigners since 1 Oct 2025 (indianvisaonline.gov.in/earrival or the Su-Swagatam app); the paper card remains in use (MZV).
- India: MZV warning (May 2025, still in force 5 Oct 2026) against travel to Jammu and Kashmir and within 10 km of the Pakistan border; it does not cover Ladakh.
- Indonesia: All Indonesia arrival form mandatory since 1 Oct 2025, to be filled in within 3 days before arrival (allindonesia.imigrasi.go.id); it replaces the separate customs and health declarations.
- Indonesia: the official e-visa site offers Czech passports the B1 visa on arrival / e-VOA for Rp 500,000, 30 days, extendable once by 30 days; no visa exemption for Czech citizens. Bali tourist levy 150,000 IDR since 14 Feb 2024.
- Iraq: since 2 Mar 2025 no visa at the border or airport without a prior e-visa application at eservice.evisa.iq (30 days, single or multiple entry).
- Iraq - Kurdistan Region: separate regime; Czech citizens get an entry permit on arrival or an e-visa at visit.gov.krd for 100,000 IQD, 30 days, valid for the region only. MZV warning against travel to Iraq updated 1 Jun 2026.
- Iran: since August 2025 tourist visas only for tours organised by Iranian travel agencies; individual tourist applications are refused (MZV).
- Iran: MZV warning updated 24 Mar 2026 - warns against all travel and calls on Czech citizens to leave immediately after the US-Israeli military action; flights were cancelled at that time.
- Iran: validity of tourist and arrival visas cut from 90 to 45 days from 1 May 2025 (Iranian embassy in Bern).
- Lesotho: eVisa system is suspended (homeaffairs.gov.ls says 'eVISA Applications System Suspended', applications by e-mail to VISA-Applications.Immigration@gov.ls); secondary source dates the suspension to April 2024. MZV still links evisalesotho.com.
- Lesotho: on 14 May 2025 the Prime Minister announced Cabinet approval of visa-free entry for all EU citizens; implementation details not found as of 5 Oct 2026 (secondary source visasnews.com). Czech citizens already have 14 days visa-free.
- Liberia: 'Visa on Arrival' requires online pre-application at visaonarrival.lis.gov.lr, fee USD 102.5 (about 91 EUR), apply at least 7 days ahead, approval valid 3 months, single entry, only via Roberts International Airport; fee confirmed on the portal today.
- Republic of the Congo: visa on arrival is no longer possible (republic-congo.com; France Diplomatie updated 15 Sep 2026); no e-visa exists. Berlin embassy fees read today: 1 month 110 EUR, 3 months 155 EUR, express double.
- Republic of the Congo: visa-free entry for all African Union nationals announced from 1 Jan 2027 (secondary sources only; not relevant for Czech citizens).
- Comoros: no change found - visa on arrival, no official e-visa; France Diplomatie page updated 15 Sep 2026 still says about 30 EUR on arrival at Moroni.
- MZV has no country-specific travel warning for KM, CG, LS or LR; only the general Africa mpox recommendation appears on the Congo (Brazzaville) travel page.
- Yellow fever per CDC pages read today (updated 25 Aug 2026): Congo required for all arrivals from 9 months; Liberia required only when arriving from a risk country (from 1 year); Comoros and Lesotho no requirement. WHO's latest country list is still the 2022 edition.
- Sierra Leone: since 18.06.2026 a mandatory online health declaration (Ebola prevention) for everyone entering and leaving, via poep.npha.gov.sl, to be filled not more than 72 hours before travel (MZV + official portal).
- Sierra Leone: official e-visa API for Czech nationality (evisa.sl) shows single entry 80 USD (validity 90 days, stay 30 days) and multiple entry 160 USD (validity 365 days, stay 30 days); 80 USD = approx. 71 EUR at ECB rate 1.1204 of 05.10.2026.
- Somalia: e-visa / eTAS mandatory for all foreigners since 01.09.2025 (etas.gov.so), 64 USD per MZV (approx. 57 EUR), max 30 days; Somaliland does not recognise it and issues its own visa on arrival (30-60 USD). MZV warns against all travel.
- Senegal: reciprocity e-visa for countries requiring visas from Senegalese (incl. EU) adopted by the Council of Ministers 30.07.2025 but still not in force - MZV, German AA (05.10.2026) and France Diplomatie (29.09.2026) all state visa-free up to 3 months.
- Senegal: per France Diplomatie, from 09.03.2026 yellow fever and other vaccination certificates are only recommended for travellers from countries without an epidemic/endemic situation; certificate still required when arriving from a yellow fever risk country (WHO, German AA).
- Seychelles: Travel Authorisation fee confirmed on the official site - 10 EUR standard (24 h), 30 EUR premium (6 h), 70 EUR expedited (60 min); 30 EUR penalty for arriving without it; application possible up to 30 days before arrival; visitor permit 3 months, extendable to 12.
- Namibia: since 1 April 2025 Czech citizens need a visa (e-visa online or visa on arrival at main ports of entry), 1,600 NAD (about 85 EUR), valid 90 days; children 6-11 pay 800 NAD, under 6 free (UK FCDO)
- Mauritania: e-visa mandatory before travel since 5 January 2025 via anrpts.gov.mr; fee 55 EUR / 60 USD paid in cash at the border; portal now offers 30 / 90 / 360-day packages
- Mozambique: new unified eVisa + eTA portal run by VFS Global launched 11 February 2026 at evisa.gov.mz; Czech Republic is NOT among the 29 eTA countries, so a full eVisa is needed (reported about 190 USD, up from about 160 USD - unverified officially)
- Mozambique: MZV warning updated 17 June 2026 - travel to the north (Cabo Delgado, northern Nampula, parts of Niassa) only if essential
- Mauritius: tourist fee of 3 EUR per night per tourist aged 12+ in tourist accommodation since 1 October 2025 (confirmed on mra.mu); mandatory free Mauritius All-in-One Travel Digital Form before boarding
- Mauritania: MZV warning (updated 3 June 2025, still in force 5 Oct 2026) advises only essential travel and none to border zones, the north and the east
- MZV pages for Namibia and Mozambique are thin or partly dated: Namibia page does not mention the April 2025 start date or the fee; Mozambique page does not mention the 2026 portal or the eTA scheme
- Tanzania: from 1 Oct 2026 mandatory state inbound travel insurance also for the mainland - 44 USD per person, valid 92 days, bought from NIC (inbound.nicinsurance.co.tz) or on arrival; EAC/SADC residents exempt; one policy only, by first point of entry (Zanzibar ZIC insurance in force since 1 Oct 2024). Confirmed on MZV, NIC portal and FCDO.
- Tanzania: tourist visa unchanged - 50 USD single entry up to 90 days, e-visa recommended, visa on arrival still available for Czech citizens (official guidelines list Czech Republic).
- Togo: new Togo Voyage platform (beta.voyage.gouv.tg) live in 2026; visa on arrival and express visas remain suspended, e-visa must be requested at least 5 working days ahead; prices unchanged (25 000 / 35 000 / 45 000 / 65 000 CFA). All African nationals now visa-free for 30 days (not relevant to Czech citizens).
- Togo: MZV advisory (updated 10.4.2025) says avoid Dapaong and everything north of it because of terrorist threat from the Sahel.
- Sao Tome and Principe: 15-day visa-free stay for EU citizens confirmed (Portuguese MNE page updated 25.2.2026); tourist tax about 3.50 EUR per person per night; airport fee increase of Dec 2024 was annulled in Jan 2025 per news reports; longer stays via eVisaST on smf.st with payment at the border.
- Sudan: MZV warning against all travel (updated 12.5.2025, valid 5.10.2026); German Foreign Office Reisewarnung dated 5.10.2026 urging nationals to leave; visa only in advance at a Sudanese embassy, no official e-visa found.
- Central African Republic: MZV warning against travel (updated 12.5.2025, valid 5.10.2026); visa still only via the embassy in Paris; the embassy web address given by MZV is defunct.
- UG: official NCIC notice of 2 Oct 2026 says a yellow fever vaccination certificate is no longer mandatory for entry into Uganda; MZV and CDC have not caught up.
- UG: MZV Ebola warning published 20 May 2026, updated 21 Jul 2026 (outbreak in DRC and Uganda): travel to the DRC border areas only if essential, border closed to regular movement since 27 May 2026. A secondary source says the outbreak was declared over on 27 Aug 2026.
- UG: e-visa is applied for online before travel at visas.immigration.go.ug, 50 USD, up to 90 days; East African Tourist Visa 100 USD (Uganda, Kenya, Rwanda). Czech Republic is not on Uganda's visa-exempt list.
- TN: since 1 Jan 2025 EU tourists need a passport (ID cards no longer accepted even on package tours) per a secondary source; MZV confirms passport only, 90 days visa-free, validity 3 months beyond the planned end of stay. Secondary sources say the planned Tunisian e-visa platform is still not running.
- ZM: Czech citizens remain visa-exempt (since 3 Nov 2022). Zambia waived visas for 53 more countries from 1 Jan 2025 and, per a tourism site, raised visa fees from 1 Jan 2026 (single entry 25 to 50 USD); neither affects Czech citizens.
- ZM: MZV warning from 30 Sep 2025 (updated 2 Oct 2025) about contaminated water in the Mwambashi and Kafue rivers, Copperbelt and Central provinces.
- ZW: Czech Republic is in Category B: visa on arrival, with the e-visa at evisa.gov.zw and an online entry declaration encouraged. KAZA Univisa is 50 USD, 30 days, covers Zambia and Zimbabwe plus Botswana day trips via Kazungula; Czech citizens are eligible.
- USD amounts converted at the ECB rate of 5 Oct 2026 (1 USD = 0.8925 EUR): 50 USD is about 45 EUR, 30 USD about 27 EUR.
- Nigeria: new e-Visa system (evisa.immigration.gov.ng) since 1 May 2025 replaced visa on arrival; Tourism Visa F5A = single entry, 30 days, visa valid 90 days from issue, not extendable; fees depend on nationality
- Nigeria: mandatory online Landing/Exit Card (lecard.immigration.gov.ng) to be filled within 3 days before arrival - MZV says from 30 June 2025 for Czech citizens
- Rwanda: from 22 May 2026 until further notice entry banned for foreigners who were in DR Congo in the previous 30 days (Ebola), stricter checks incl. Kigali airport (MZV warning updated 11 June 2026)
- Rwanda: MZV warns against border areas with DR Congo (Gisenyi/Rubavu, Western Province districts); land borders with DRC and Burundi reported closed (MZV, Jan 2025)
- Niger: August 2025 reciprocity measure - citizens of Germany, Italy, Netherlands, Belgium and UK can get visas only in Geneva, Ankara or Moscow (press reports); MZV warning (updated 11 April 2025) says avoid south and north completely, elsewhere only essential travel
- Equatorial Guinea: e-visa (since July 2023, VFS Global official partner) open to all nationalities, 50 USD + 25 USD service fee, only for arrival at Malabo airport; MZV page still lists only embassy visas
- Ivory Coast: e-visa via SNEDAI still 73 EUR (3 months, multiple entry), visa issued on arrival at Abidjan airport after online pre-enrolment; MZV warning (10 April 2025) against the north-east (Savanes, Zanzan) and border areas with Liberia, Mali, Burkina Faso
- Exchange rate used: ECB 5 Oct 2026, 1 EUR = 1.1204 USD
- Madagascar: new visa tariff effective 16 Feb 2026 on the official e-visa portal - 1-15 days 30 EUR/35 USD, 16-30 days 35 EUR, 31-60 days 40 EUR, 61-90 days 50 EUR, same price on arrival; MZV and gov.uk still state a 10 EUR fee for stays up to 15 days.
- Malawi: visa is required again for Czech citizens (the 2024 visa waiver was withdrawn; secondary sources date this to 3 Jan 2026); since 24 Feb 2026 an official notice allows visa on arrival for 'Category Two' countries, and the official list includes Czechia. E-visa remains the recommended route, 50 USD single entry.
- Mali: MZV warning now says it warns against travel and calls for leaving the country quickly (still valid 5 Oct 2026). Visa requests go through the official portal diplomatiemdc.gouv.ml, handled for Czech residents by the embassy in Rome (110 EUR / 3 months).
- Libya: MZV warning against all travel (published 16 May 2025, still valid 5 Oct 2026). The official e-visa portal evisa.gov.ly lists the Czech Republic as eligible; tourist e-visa only with a registered Libyan tourism company as sponsor.
- Madagascar: MZV advisory after the October 2025 unrest (updated 7 Nov 2025, still valid) - situation calmer under the transitional government, increased caution advised.
- Morocco: unchanged, visa-free up to 90 days with a passport. The AEVM electronic travel authorisation applies only to a few non-EU nationalities, not to Czech citizens.
- ECB rate on 5 Oct 2026 used for conversions: 1 EUR = 1.1204 USD.
- Greenland: Danish Immigration Service news of 20.03.2026 - third-country nationals with a Schengen/Danish residence permit no longer need a visa/entry permit for Greenland and the Faroe Islands; no change for EU citizens, who still need a passport (EU ID cards not accepted, only Nordic ones).
- Guatemala: MZV security warning published 20.01.2026, updated 24.03.2026, still valid 5.10.2026 - exercise increased caution (organised crime, armed robberies). Electronic Declaración Jurada Regional de Viajero (SAT) is required on entry and exit; MZV visa page does not mention it.
- Honduras: online customs declaration DJRV (sisglobal.aduanas.gob.hn/Pech/#/plataforma/otra_gestiones/formularioDJRV) required before entering or leaving, per Spanish MFA (updated 12.05.2026) and UK FCDO; MZV page does not mention it. Prechequeo migratorio reportedly no longer mandatory since Dec 2023 except for Nicaraguans (press, not confirmed on INM site).
- Honduras now requires a visa from British nationals (UK FCDO) - does not affect Czech citizens, who remain visa-free for 90 days per MZV.
- Haiti: MZV warning against all travel (updated 30.05.2025, still valid 5.10.2026), nationwide state of emergency since Sept 2024; press reports say the US FAA ban on US commercial flights to Port-au-Prince was extended again in Sept 2026 until March 2027.
- CA-4 (GT, HN, SV, NI): the 90 visa-free days are shared across all four countries; MZV advises checking the number of days actually granted at first entry.
- Saved WHO lists in pages-namerica are old editions (2013-era and Nov 2022/Jan 2023 revision); yellow-fever requirements for GT, HT, HN taken from the 2022 edition plus MZV.
- DO: passport-validity waiver for EU citizens (passport only needs to be valid for the stay) extended by DGM memo from 1 Dec 2025 to 31 Dec 2026; MZV page still says 6 months
- DO: e-ticket (eticket.migracion.gob.do) remains mandatory and free for entry and exit on commercial flights; the 72-hour window was dropped - it can be filled in any time after booking
- GD: Grenada launched an online ED card (immigration and customs form) at edcard.gov.gd on 2 March 2026, fillable from 72 hours before arrival
- BZ: online immigration and customs declaration iDeclare (ideclare.gov.bz) in place since 1 Dec 2024 at the international airport and from 1 Jan 2025 at all ports of entry
- BZ: CDC (updated April 2025) and the WHO 2022 list show no yellow fever entry requirement for Belize, unlike older WHO lists
- DM: online ED card (edcard.dominica.gov.dm) is to be submitted no more than 3 days before travel; visa-free stay for Czech citizens stays at 6 months
- No MZV travel warning found for any of the four countries; none requires ETA, e-visa or accepts a Czech ID card
- Kostarika: nová směrnice migrace (La Gaceta č. 216, 17. 11. 2025) – 1. skupina vč. ČR smí bez víza až 180 dní (dříve 90), pas formálně stačí s 1 dnem platnosti; MZV je zatím neaktualizované.
- Kostarika: podle sekundárního zdroje (Travel Market Report) je od 1/2025 žlutá zimnice povinná při příjezdu z rizikových zemí (Jižní Amerika vč. Trinidadu a Tobaga, vybrané africké státy).
- Kuba: místo turistické karty je od 7/2024 e-vízum (evisacuba.cu, 750 CZK přes velvyslanectví v Praze, ~31 EUR), před letem povinný formulář D'Viajeros (nejdříve 72 h předem) a cestovní pojištění.
- Kuba: MZV od 16. 6. 2026 (stále platí k 5. 10. 2026) varuje před cestami kvůli krizi energií a paliv, výpadkům elektřiny, rušeným letům, kriminalitě a nepokojům.
- Kanada: eTA beze změny, 7 CAD (~4 EUR), platí až 5 let, jen pro přílet letecky; pobyt do 6 měsíců; MZV upozorňuje na letní lesní požáry 2026.
- Jamajka: pro ČR jen 30 dní bez víza (seznam PICA aktualizovaný 13. 3. 2025; některé státy EU mají 90 dní); povinný bezplatný online formulář C5 (enterjamaica.gov.jm) lze vyplnit až 30 dní předem.
- Mexiko: 180 dní už není automatických, úředník zapíše počet dní ručně nebo e-gate; digitální FMM se stahuje po příletu; MZV 30. 4. 2026 aktualizovalo varování (jen nezbytné cesty do řady států).
- Svatý Kryštof a Nevis: od 26. 5. 2025 je pro všechny návštěvníky povinná eTA na www.knatravelform.kn, poplatek 17 USD (asi 15 EUR), platnost 90 dní od vydání, jednovstupová. MZV ji zatím neuvádí a zmiňuje jen příjezdový formulář.
- Svatý Kryštof a Nevis: OP stačí jen občanům OECS, turisté potřebují cestovní pas. Česko není na oficiálním seznamu zemí s vízovou povinností (v Evropě jen Andorra a Bosna a Hercegovina).
- Trinidad a Tobago: od 17. 3. 2026 je povinná online příletová a odletová karta na travel.gov.tt, zdarma, nejdříve 72 hodin před cestou, s QR kódy. MZV ji zatím neuvádí.
- Trinidad a Tobago: 2. 3. 2026 byl vyhlášen nový celostátní výjimečný stav kvůli kriminalitě a v březnu 2026 byl prodloužen. Stránka MZV zmiňuje jen stav z let 2024 a 2025. USA drží stupeň varování 3.
- Svatá Lucie: online imigrační formulář travelslu.govt.lc (CARICOM IMPACS) je zdarma, otevírá se 72 hodin před cestou a OP přijímá jen od občanů OECS. Český OP nestačí.
- Svatý Vincenc a Grenadiny: portál vctedcard.caricomimpacs.org uvádí povinný online celní a imigrační formulář 72 hodin před příletem, MZV o něm nepíše.
- Klasifikace: online příletové karty bez schvalování (LC, VC, TT) jsem dal jako visa none s popisem v notes, podle příkladu TH v zadání. Jen KN s eTA je visa eta.
- USA: poplatek ESTA vzrostl z 21 na 40 USD (30. 9. 2025); oficiální web ESTA dnes uvádí 40,27 USD (MZV 40 USD, konzulát v Chicagu zastarale 21 USD).
- USA: CBP v prosinci 2025 navrhl povinné sociální sítě za 5 let, telefony, e-maily a údaje o rodině v ESTA; finální pravidlo jsem nenašel. ESTA již dnes žádá selfie a existuje aplikace ESTA Mobile.
- USA: omezení po cestě na Kubu od 12. 1. 2021 platí dál (nutné vízum); ESTA je nutná i při tranzitu a platí 2 roky.
- Nikaragua: od 16. 2. 2026 nová regulace 002-2026, 128 zemí potřebuje vízum kategorie C (mj. Mexiko, Peru); občané EU zůstávají bez víz na 90 dní.
- Nikaragua: předběžný formulář DGME 7 dní předem (zdarma, e-mailem) je podle DGME doporučený; MZV ho uvádí jen pro NGO, La Prensa pro všechny cizince.
- Salvador: od 13. 1. 2023 turistické povolení 180 dní místo 90 (oficiální prohlášení prezidenta), MZV stránka je zastaralá; celní deklarace je od 1. 3. 2023 digitální.
- Panama: oficiální turistický web říká, že žlutá zimnice již není povinná a pas stačí s 3 měsíci platnosti; stále 90 dní, 500 USD a zpáteční letenka. Přísnější kontroly z 10/2023 míří na migranty, ne na turisty.
- Surinam: Entry Fee je od 15. 5. 2024 50 USD/EUR (+8 USD/EUR servis VFS), od 1. 5. 2025 existuje i vícenásobný voucher za 75; MZV stále uvádí zastaralých 25 EUR (oficiální vfs/gov.sr stránky potvrzují 50).
- Surinam: povinný bezplatný digitální formulář ICF (icf.sr) pro všechny cestující, bez něj nelze nastoupit do letadla; voucher Entry Fee se předkládá při odbavení (od 15. 1. 2024). Česko je na oficiálním seznamu zemí s Entry Fee, ne s e-vízem.
- Venezuela: MZV (aktualizace 26. 6. 2026) varuje před pohraničím s Kolumbií a státy Amazonas, Apure, Táchira, Bolívar; do ostatních oblastí jen nezbytné cesty. Po zemětřesení 24. 6. 2026 letiště Maiquetía obnovilo provoz s omezeními.
- Venezuela: od jara 2026 funguje e-visa portál ministerstva zahraničí; občané ČR jsou nadále bezvízově do 90 dní (jen komerční let, pas min. 6 měsíců, ŽZ povinná při příjezdu z Brazílie).
- Austrálie: eVisitor 651 je stále zdarma (Česko v seznamu způsobilých pasů, pobyt do 3 měsíců, platnost 12 měsíců); ABF postupně nahrazuje papírovou příletovou kartu digitální Australia Travel Declaration (celostátně do konce 2027).
- Uruguay: beze změn, oficiální matice víz (aktualizace 19. 8. 2025) potvrzuje bezvízový styk pro ČR; CDC (9/2026) žlutou zimnici nevyžaduje ani nedoporučuje.
- Brazílie: oficiální tabulka vízového režimu (QGRV, aktualizace 26. 8. 2026) pro Česko uvádí bezvízový pobyt 90 dnů za 180 dnů, jen s pasem. Žádné eTA pro občany EU neexistuje.
- Ekvádor: povinný certifikát žluté zimnice pro příjezdy z Bolívie, Brazílie, Kolumbie a Peru platil od 12. 5. 2025 a 27. 8. 2025 byl zrušen (jen doporučení). Stránky MZV a CDC jsou zastaralé.
- Ekvádor: Galapágy stojí od 1. 8. 2024 vstupní poplatek 200 USD plus TCT 20 USD. MZV upozorňuje na výjimečný stav a na výpis z rejstříku s apostilou při vstupu pozemně z Peru a Kolumbie.
- Argentina: dekret DNU 366/2025 (29. 5. 2025) zavedl povinné zdravotní pojištění a čestné prohlášení pro cizince. Čestné prohlášení zatím není regulováno, veřejné nemocnice ale ošetřují cizince jen s pojištěním nebo za platbu předem.
- Bolívie: MZV od 25. 6. 2026 upozorňuje na stav nouze v celé zemi, blokády silnic a nedostatek zboží. Dekret DS 5497 (12/2025) zrušil víza pro USA, Izrael a další státy, Česko bylo bez víz už dříve.
- Žádná ze čtyř zemí nemá pro Čechy eTA ani e-vízum, všechny jsou klasifikovány jako none a OP nestačí.
- Kolumbie: Check-Mig je podle Migración Colombia (duben až červen 2026) zdarma a nepovinný, ale MZV ho stále uvádí jako oficiálně vyžadovaný.
- Guyana: oficiální seznam bezvízových zemí (aktualizace 17. 7. a 16. 10. 2025) neobsahuje ČR; postup je online předschválení přes eservices.iss.gov.gy a vízum 25 USD při příletu na 1 měsíc, údaje MZV jsou zastaralé.
- Paraguay: od 9. 5. 2025 (Res. MSPBS 268/2025) je povinný certifikát o očkování proti žluté zimnici (věk 1 až 59 let) při příjezdu z rizikových oblastí Brazílie, Bolívie, Peru, Kolumbie a Guyany.
- Chile: dekret č. 359 (Diario Oficial 17. 9. 2025) potvrdil seznam zemí s nutným předchozím povolením nebo vízem; ČR v něm není, Austrálie byla vyňata.
- Chile: podle průvodce Migraciones z 9. 5. 2025 platí občanský průkaz jen pro státy Mercosuru a Bolívii, Češi potřebují pas.
- Peru: Migraciones trvá na platnosti pasu min. 6 měsíců a TAM virtual vzniká automaticky; MigraCheck je jen volitelná předregistrace pro e-gates.
- MH: MZV je neaktuální (píše o víze po příjezdu za 25 USD). Oficiální seznam RMI (stav 3/2024, nahraný na web 2026) řadí občany EU mezi bezvízové: 90 dní ve 180 dnech, pas 6 měsíců po odjezdu, zpáteční letenka, bez prodloužení.
- MH: oznámení Immigration z ledna 2026 doporučuje mít zpáteční letenku vytištěnou, digitální doklad nemusí být uznán.
- KI: Immigration Entry and Visa Exemption Order 2023 (účinný od 1. 9. 2023) osvobozuje ČR od víz na max. 90 dní za 12 měsíců a vyžaduje pas platný 6 měsíců ke dni odjezdu. MZV stále uvádí 3 měsíce.
- FJ: ČR je na oficiálním seznamu bezvízových zemí. Návštěvnické povolení při příletu až na 4 měsíce (prodloužení do 6), pas 6 měsíců po odjezdu, zpáteční letenka, adresa pobytu.
- FM: beze změny, 30 dní bez povolení (delší pobyt povolením až +60 dní), pas 120 dní po vstupu, formulář CIQ, odletová taxa cca 20 USD.
- Žádná ze čtyř zemí nevyžaduje ETA ani e-vízum od občanů EU (RMI má portál eVisa, ale EU má bezvízový režim).
- Žlutá zimnice: podmíněně povinná (při příletu z rizikové země) jen pro Fidži a formálně pro FM. Kiribati a Marshallovy ostrovy ji nepožadují (WHO, CDC 2026).
- PG: digitální příletová karta PNGDAC (pngdac.ica.gov.pg) byla zavedena 1. 10. 2025. Oznámení ICA z 6. 8. 2026 ji dělá povinnou pro všechny před vydáním palubní vstupenky, do 72 hodin před příletem.
- PG: podle portálu ICA mohou Češi požádat online o Easy Visitor Permit na 60 dní za 50 USD (cca 45 EUR). MZV tuto možnost nezmiňuje a uvádí jen vízum na zastupitelském úřadu.
- NZ: potvrzeno, že Česko je v seznamu bezvízových zemí. NZeTA stojí 17 NZD v aplikaci nebo 23 NZD na webu a platí 2 roky. K tomu IVL 100 NZD (zvýšena z 35 NZD od 1. 10. 2024), celkem cca 58 až 61 EUR. Online NZ Traveller Declaration je povinná a zdarma, lze ji podat nejdříve 24 hodin před cestou.
- WS: úřad imigrace Samoy dnes uvádí bezplatné návštěvnické povolení na 90 dní pro všechny cizince, což se shoduje s MZV. Britský web a MFAT PDF z roku 2021 uvádějí starších 60 dní. Pro příjezd platí pas min. 6 měsíců po odjezdu, zpáteční letenka, výpis z účtu a adresa pobytu.
- PW: kromě 90 dní za 180 platí povinný online Palau Entry Form (palautravel.pw) do 72 hodin před příletem s QR kódem pro odbavení. Poplatek PPEF 100 USD je od roku 2018 zahrnut v ceně letenky.
- NR: vízum je nutné předem a Nauru zůstává nejobtížnější z pěti zemí. MZV přímo varuje, že Nauru v minulosti několikrát přestalo víza vydávat. Turistické vízum je na max. 30 dní.
- Kurzy k 6. 10. 2026 (open.er-api.com): 1 EUR = 1,12094 USD, 2,00346 NZD. Žlutá zimnice podle seznamu WHO (vydání 2022/2023, nové vydání jsem nenašel): PG a WS vyžadují certifikát jen při příletu z rizikové země (PG i po tranzitu), NR, NZ a PW nevyžadují.
- Šalomounovy ostrovy: 6. 9. 2026 byl spuštěn nový elektronický vízový systém a nový vízový režim (34 kategorií víz, online platba). Turistické vízum pro ty, kdo vízum potřebují, stojí 100 USD a počáteční pobyt je 30 dní (celkem až 180).
- Šalomounovy ostrovy: Legal Notice 128 ze 6. 6. 2025 (Gazette) uvádí Českou republiku a ostatní státy EU mezi zeměmi se zvýhodněným vstupem ('concessional entry arrangement'). MZV, AA a Tourism Solomons tvrdí bezvízový vstup.
- Šalomounovy ostrovy: MZV je vůči novému režimu bez aktualizace. Web úřadu pro EU nabízí 'Mutual Reciprocal Visa Exemption' (poplatek prominut, 90 dní, nutný dopis ministerstva či organizace).
- Tonga: tongská ambasáda uvádí, že občané států Schengenu včetně ČR dostanou automaticky 90 dní při příletu (ostatní 31 dní zdarma). Starší stránka tongské celnice uvádí 30 dní a ČR v seznamu nemá, je zastaralá.
- Vanuatu: oficiální web imigračního úřadu má Českou republiku na seznamu osvobozených zemí. Turistické vízum při příletu platí až 120 dní bez prodloužení, MZV a AA uvádějí 90 dní. Pas musí platit déle než 6 měsíců a je nutná zpáteční letenka a adresa pobytu. AA zmiňuje v roce 2026 ohnisko ciguatery.
- Tonga, Tuvalu a Vanuatu: žádné nové povinné ETA ani e-visa pro české turisty jsem nenašel. AA (stav 6. 10. 2026) potvrzuje 90/180 dní, zpáteční letenku a že občanský průkaz neplatí.
- Žlutá zimnice: na Šalomounových ostrovech se vyžaduje při příletu z rizikové země (od 9 měsíců, WHO, AA, FCDO). U Tongy to podle AA platí také, WHO uvádí žádný požadavek. U Tuvalu a Vanuatu žádný požadavek.
- Vanuatu a Šalomounovy ostrovy: malárie se vyskytuje (Šalomounovy ostrovy celoročně P. falciparum, Vanuatu hlavně P. vivax). Tonga a Tuvalu: riziko dengue.

## Přehled všech zemí

| Země | Režim | OP | Dní | Ověřeno |
|---|---|---|---|---|
| Afghánistán (AF) | visa | ne | 30 | ano |
| Albánie (AL) | none | ano | 90 | ano |
| Alžírsko (DZ) | visa | ne | 90 | ano |
| Andorra (AD) | none | ano | 90 | ano |
| Angola (AO) | none | ne | 30 | ano |
| Antigua a Barbuda (AG) | none | ne | 180 | ano |
| Argentina (AR) | none | ne | 90 | ano |
| Arménie (AM) | none | ne | 180 | ano |
| Austrálie (AU) | eta | ne | 90 | ano |
| Bahamy (BS) | none | ne | 90 | ano |
| Bahrajn (BH) | evisa | ne | 14 | ano |
| Bangladéš (BD) | visa | ne | 30 | ano |
| Barbados (BB) | none | ne | 90 | ano |
| Belgie (BE) | eu | ano | — | ano |
| Belize (BZ) | none | ne | 30 | ano |
| Benin (BJ) | evisa | ne | 30 | ano |
| Bhútán (BT) | evisa | ne | 90 | ano |
| Bolívie (BO) | none | ne | 90 | ano |
| Bosna a Hercegovina (BA) | none | ano | 90 | ano |
| Botswana (BW) | none | ne | 90 | ano |
| Brazílie (BR) | none | ne | 90 | ano |
| Brunej (BN) | none | ne | 90 | ano |
| Bulharsko (BG) | eu | ano | — | ano |
| Burkina Faso (BF) | evisa | ne | 90 | ano |
| Burundi (BI) | evisa | ne | 30 | ano |
| Bělorusko (BY) | none | ne | 30 | ano |
| Chile (CL) | none | ne | 90 | ano |
| Chorvatsko (HR) | eu | ano | — | ano |
| Demokratická republika Kongo (CD) | visa | ne | — | ano |
| Dominika (DM) | none | ne | 180 | ano |
| Dominikánská republika (DO) | none | ne | 30 | ano |
| Dánsko (DK) | eu | ano | — | ano |
| Džibutsko (DJ) | evisa | ne | 90 | ano |
| Egypt (EG) | voa | ne | 30 | ano |
| Ekvádor (EC) | none | ne | 90 | ano |
| Eritrea (ER) | visa | ne | 30 | ano |
| Estonsko (EE) | eu | ano | — | ano |
| Eswatini (SZ) | none | ne | 30 | ano |
| Etiopie (ET) | evisa | ne | 30 | ano |
| Fidži (FJ) | none | ne | 120 | ano |
| Filipíny (PH) | none | ne | 30 | ano |
| Finsko (FI) | eu | ano | — | ano |
| Francie (FR) | eu | ano | — | ano |
| Gabon (GA) | evisa | ne | 90 | ano |
| Gambie (GM) | none | ne | 90 | ano |
| Ghana (GH) | evisa | ne | 60 | ano |
| Grenada (GD) | none | ne | 90 | ano |
| Gruzie (GE) | none | ano | 365 | ano |
| Grónsko (GL) | none | ne | 90 | ano |
| Guatemala (GT) | none | ne | 90 | ano |
| Guinea (GN) | evisa | ne | 90 | ano |
| Guinea-Bissau (GW) | visa | ne | 30 | ano |
| Guyana (GY) | voa | ne | 30 | ano |
| Haiti (HT) | none | ne | 90 | ano |
| Honduras (HN) | none | ne | 90 | ano |
| Indie (IN) | evisa | ne | 30 | ano |
| Indonésie (ID) | voa | ne | 30 | ano |
| Irsko (IE) | eu | ano | — | ano |
| Irák (IQ) | evisa | ne | 30 | ano |
| Island (IS) | eu | ano | — | ano |
| Itálie (IT) | eu | ano | — | ano |
| Izrael (IL) | eta | ne | 90 | ano |
| Jamajka (JM) | none | ne | 30 | ano |
| Japonsko (JP) | none | ne | 90 | ano |
| Jemen (YE) | visa | ne | — | ano |
| Jihoafrická republika (ZA) | none | ne | 90 | ano |
| Jižní Korea (KR) | none | ne | 90 | ano |
| Jižní Súdán (SS) | evisa | ne | 180 | ano |
| Jordánsko (JO) | voa | ne | 30 | ano |
| Kambodža (KH) | voa | ne | 30 | ano |
| Kamerun (CM) | evisa | ne | 180 | ano |
| Kanada (CA) | eta | ne | 180 | ano |
| Kapverdy (CV) | eta | ne | 30 | ano |
| Katar (QA) | none | ne | 90 | ano |
| Kazachstán (KZ) | none | ne | 30 | ano |
| Keňa (KE) | eta | ne | 90 | ano |
| Kiribati (KI) | none | ne | 90 | ano |
| Kolumbie (CO) | none | ne | 90 | ano |
| Komory (KM) | voa | ne | 45 | ano |
| Kongo (republika) (CG) | visa | ne | 90 | ano |
| Kosovo (XK) | none | ano | 90 | ano |
| Kostarika (CR) | none | ne | 180 | ano |
| Kuba (CU) | evisa | ne | 90 | ano |
| Kuvajt (KW) | voa | ne | 90 | ano |
| Kypr (CY) | eu | ano | — | ano |
| Kyrgyzstán (KG) | none | ne | 30 | ano |
| Laos (LA) | evisa | ne | 30 | ano |
| Lesotho (LS) | none | ne | 14 | ano |
| Libanon (LB) | voa | ne | 30 | ano |
| Libye (LY) | visa | ne | — | ano |
| Libérie (LR) | evisa | ne | 30 | ano |
| Lichtenštejnsko (LI) | eu | ano | — | ano |
| Litva (LT) | eu | ano | — | ano |
| Lotyšsko (LV) | eu | ano | — | ano |
| Lucembursko (LU) | eu | ano | — | ano |
| Madagaskar (MG) | voa | ne | 60 | ano |
| Malajsie (MY) | none | ne | 90 | ano |
| Malawi (MW) | evisa | ne | 30 | ano |
| Maledivy (MV) | voa | ne | 30 | ano |
| Mali (ML) | visa | ne | 90 | ano |
| Malta (MT) | eu | ano | — | ano |
| Maroko (MA) | none | ne | 90 | ano |
| Marshallovy ostrovy (MH) | none | ne | 90 | ano |
| Mauricius (MU) | none | ne | 90 | ano |
| Mauritánie (MR) | evisa | ne | 30 | ano |
| Maďarsko (HU) | eu | ano | — | ano |
| Mexiko (MX) | none | ne | 180 | ano |
| Mikronésie (FM) | none | ne | 30 | ano |
| Moldavsko (MD) | none | ano | 90 | ano |
| Monako (MC) | none | ano | 90 | ano |
| Mongolsko (MN) | none | ne | 30 | ano |
| Mosambik (MZ) | evisa | ne | 30 | ano |
| Myanmar (Barma) (MM) | evisa | ne | 28 | ano |
| Namibie (NA) | evisa | ne | 90 | ano |
| Nauru (NR) | visa | ne | 30 | ano |
| Nepál (NP) | voa | ne | 90 | ano |
| Niger (NE) | visa | ne | — | ano |
| Nigérie (NG) | evisa | ne | 30 | ano |
| Nikaragua (NI) | none | ne | 90 | ano |
| Nizozemsko (NL) | eu | ano | — | ano |
| Norsko (NO) | eu | ano | — | ano |
| Nový Zéland (NZ) | eta | ne | 90 | ano |
| Německo (DE) | eu | ano | — | ano |
| Omán (OM) | none | ne | 14 | ano |
| Palau (PW) | none | ne | 90 | ano |
| Palestina (PS) | eta | ne | 90 | ne |
| Panama (PA) | none | ne | 90 | ano |
| Papua-Nová Guinea (PG) | evisa | ne | 60 | ano |
| Paraguay (PY) | none | ne | 90 | ano |
| Peru (PE) | none | ne | 90 | ano |
| Pobřeží slonoviny (CI) | evisa | ne | 90 | ano |
| Polsko (PL) | eu | ano | — | ano |
| Portugalsko (PT) | eu | ano | — | ano |
| Pákistán (PK) | evisa | ne | 90 | ano |
| Rakousko (AT) | eu | ano | — | ano |
| Rovníková Guinea (GQ) | evisa | ne | — | ano |
| Rumunsko (RO) | eu | ano | — | ano |
| Rusko (RU) | evisa | ne | 30 | ano |
| Rwanda (RW) | voa | ne | 30 | ano |
| Salvador (SV) | none | ne | 180 | ano |
| Samoa (WS) | none | ne | 90 | ano |
| San Marino (SM) | none | ano | 90 | ano |
| Saúdská Arábie (SA) | evisa | ne | 90 | ano |
| Senegal (SN) | none | ne | 90 | ano |
| Severní Korea (KP) | visa | ne | — | ano |
| Severní Makedonie (MK) | none | ano | 90 | ano |
| Seychely (SC) | eta | ne | 90 | ano |
| Sierra Leone (SL) | evisa | ne | 30 | ano |
| Singapur (SG) | none | ne | 90 | ano |
| Slovensko (SK) | eu | ano | — | ano |
| Slovinsko (SI) | eu | ano | — | ano |
| Somálsko (SO) | evisa | ne | 30 | ano |
| Spojené arabské emiráty (AE) | none | ne | 90 | ano |
| Spojené království (GB) | eta | ne | 180 | ano |
| Spojené státy americké (US) | eta | ne | 90 | ano |
| Srbsko (RS) | none | ano | 90 | ano |
| Srí Lanka (LK) | eta | ne | 30 | ano |
| Středoafrická republika (CF) | visa | ne | — | ano |
| Surinam (SR) | eta | ne | 90 | ano |
| Svatá Lucie (LC) | none | ne | 90 | ano |
| Svatý Kryštof a Nevis (KN) | eta | ne | 90 | ano |
| Svatý Tomáš a Princův ostrov (ST) | none | ne | 15 | ano |
| Svatý Vincenc a Grenadiny (VC) | none | ne | 90 | ano |
| Súdán (SD) | visa | ne | — | ano |
| Sýrie (SY) | voa | ne | 30 | ne |
| Tanzanie (TZ) | evisa | ne | 90 | ano |
| Tchaj-wan (TW) | none | ne | 90 | ano |
| Thajsko (TH) | none | ne | 30 | ano |
| Togo (TG) | evisa | ne | 90 | ano |
| Tonga (TO) | none | ne | 90 | ano |
| Trinidad a Tobago (TT) | none | ne | 90 | ano |
| Tunisko (TN) | none | ne | 90 | ano |
| Turecko (TR) | none | ne | 90 | ano |
| Turkmenistán (TM) | evisa | ne | — | ne |
| Tuvalu (TV) | none | ne | 90 | ano |
| Tádžikistán (TJ) | none | ne | 30 | ano |
| Uganda (UG) | evisa | ne | 90 | ano |
| Ukrajina (UA) | none | ne | 90 | ano |
| Uruguay (UY) | none | ne | 90 | ano |
| Uzbekistán (UZ) | none | ne | 30 | ano |
| Vanuatu (VU) | none | ne | 90 | ano |
| Venezuela (VE) | none | ne | 90 | ano |
| Vietnam (VN) | none | ne | 45 | ano |
| Východní Timor (TL) | none | ne | 90 | ano |
| Zambie (ZM) | none | ne | 90 | ano |
| Zimbabwe (ZW) | voa | ne | 30 | ano |
| Ázerbájdžán (AZ) | evisa | ne | 30 | ano |
| Írán (IR) | visa | ne | — | ano |
| Čad (TD) | evisa | ne | — | ano |
| Černá Hora (ME) | none | ano | 90 | ano |
| Česko (CZ) | eu | ano | — | ano |
| Čína (CN) | visa | ne | — | ano |
| Řecko (GR) | eu | ano | — | ano |
| Šalomounovy ostrovy (SB) | none | ne | 90 | ano |
| Španělsko (ES) | eu | ano | — | ano |
| Švédsko (SE) | eu | ano | — | ano |
| Švýcarsko (CH) | eu | ano | — | ano |

## Omezení

- Stránky MZV nejsou u všech zemí aktuální; kde oficiální web cílové země říkal něco novějšího, má přednost a je to uvedeno v `notes`.
- Ceny elektronických registrací a víz jsou přepočtené na eura přibližným kurzem a zaokrouhlené; původní částka bývá v `notes`.
- U zemí s konfliktem nebo varováním MZV popisuje záznam formální režim, ne to, zda je cesta rozumná.
- Pravidla se mění; před cestou je potřeba podmínky ověřit u MZV a u úřadů cílové země.
- Nezávislé ověření druhým agentem zatím neproběhlo (viz úvod).
