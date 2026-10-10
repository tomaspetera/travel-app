# ATLAS – kontrola PR #44 a #45 na živém webu (10. 10. 2026)

Skutečný Chrome, telefon 390×844 (čistý stav) a počítač 1300×900 (stav přenesený z telefonu), sestavení `54a309b5bdbf`. Ostrých hledání 12 během asi 25 minut (chtěli jste ~8; tři navíc šly na opakování Bangkoku, „kamkoliv“ a Londýna s čistým formulářem, viz bod 2). Nic se neinstalovalo, kód se neměnil. Skripty a všechny snímky: `%TEMP%\atlas-qa\r13\`.

## Nefunguje podle zadání

1. **Cena karty Svátků ≠ cena po kliknutí.** Karta Vánoc „Varšava 1 950 Kč/os., BTS → WMI, 24.12.–27.12.“; po kliknutí je nejlevnější stejný let za 2 295 Kč/os. a záhlaví hlásí „nejlevněji 2 295 Kč“.
   - Karta vychází z nabídky Kiwi (tam BTS → WMI 08:00, zpět z WAW; letiště do města 130 Kč).
   - Hledání do Varšavy tuhle nabídku Kiwi nevrátilo. Nejlevnější je Ryanair tam i zpět přes WMI (658 + 877 Kč, letiště do města 220 Kč) = 2 295 Kč; kombinace se zpátečním letem Kiwi z WAW vyjde na 2 488 Kč.
   - Rozdíl tedy není v odletu v předvečer (ten je stejný), ale v tom, že „kamkoliv“ a hledání do jednoho cíle dostávají od Kiwi jiné nabídky.
   - Snímky: `check-r13/m13-02-svatky-vanoce.png`, `check-r13/m13-03-karta-dalsi-moznosti.png`.

## K zamyšlení (není proti zadání)

2. **Omezení „předvečer od 16:00“ a termín z karty zůstávají ve formuláři i pro další hledání.** Po kartě Vánoc jsem ve formuláři Lety jen vyměnil cíl za Bangkok a klikl „3 měsíce“. Odeslalo se: odlet od 23. 12. (ne od příštího týdne) a `depAfter 23.12. 16:00`; zaškrtávátko „St 23.12. (předvečer volna) jen odlety od 16:00“ zůstalo vidět a zaškrtnuté. Výsledky pak byly jiné než u čistého hledání (první Air Arabia s „přílet ?“). Stejně dopadlo „kamkoliv“: 0 nabídek. Je to obdoba dřívějšího nálezu se zděděným nastavením, tentokrát přímo ve formuláři Lety. Návrh: při změně cíle nebo termínu omezení z karty zrušit, nebo ho ukázat jako odstranitelný štítek nad výsledky. Snímek: `check-r13/m13-07-bangkok-cena-delka.png`.

## Funguje

**1) Radar Svátky**
- Pod přepínačem tři víkendy: „14. 11.–17. 11. Den boje za svobodu“, „24. 12.–27. 12. Vánoce“, „1. 1.–3. 1. Nový rok“ (počítač: jeden řádek).
- Přepnutí na Vánoce (12 s) a zpět funguje, volba se pamatuje i po znovuotevření aplikace bez nového hledání.
- Nad kartami „Za osobu (cestujete 2): zpáteční letenka + cesta na letiště a z letiště do města“.
- Odlet v předvečer: u 14.–17. 11. žádná karta v předvečer neodlétá; u Vánoc dvě (Skopje 23. 12. ve 22:50, Atény 23. 12. v 19:55). Žádná před 16:00. Návrat všech karet poslední volný den.

**2) Karta Svátků → Lety**
- V Dalších možnostech je zaškrtnuté „St 23.12. (předvečer volna) jen odlety od 16:00“, v záhlaví výsledků „23.12. odlet od 16:00“. Ve výsledcích není žádný odlet v předvečer před 16:00.
- U běžného hledání v čistém prohlížeči zaškrtávátko vidět není (ani prázdné); na počítači po hledání z plánovače také ne.

**3) Radar → změnit**
- Výběr „ceny pro 1 osobu / 2 osoby / … / 6 osob“, výchozí 2 osoby.
- 1 osoba: radar hledá znovu (dotaz adults=1), text jen „Za osobu: …“, první karta Tirana 1 606 Kč.
- Zpět 2 osoby: nové hledání (adults=2), text „Za osobu (cestujete 2): …“, první karta Tuzla 1 411 Kč.

**4) Plánovač → Nová cesta**
- Petrohrad 🇷🇺, Valencie 🇪🇸, Londýn 🇬🇧, Kos 🇬🇷 (ne Kosovo); Bagan a Birmingham bez vlajky (🧳 / 📍).
- Londýn → „Hledat lety“ hledá Londýn s přesnými daty cesty pro 2 osoby.

**5) Bangkok, „Cena + délka cesty“ (čistý formulář, 11–16 nocí, 2 os.)**
- Podle ceny: Air Arabia „přílet ?“ 11 419, Air Arabia „přílet ?“ 11 479, Air China 14 h 40 / 15 h 05 za 11 871.
- Podle ceny + délky: Air China 11 871, Air China 12 672, pak teprve Air Arabia „přílet ?“ 11 419 a 11 479.

**6) Kamkoliv z Brna**
- Berlín je mezi výsledky (BTS → BER, 1 998 Kč) a po rozbalení má štítek „🚆 z letiště BER do centra ~120 Kč · 40 min (odhad)“ a v ceně „+ z letiště do města a zpět ~240 Kč/os.“. Ověřeno nad uloženou odpovědí téhož hledání, telefon i počítač.
- Mnichov mezi 150 cíli nebyl, takže neověřeno.

**Obecně**
- Žádná chyba stránky ani konzole, žádné přetečení do šířky, načtení 1,2–1,3 s.
