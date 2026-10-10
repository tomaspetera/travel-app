# ATLAS – kontrola kola 11–12 na živém webu (10. 10. 2026)

Skutečný Chrome, telefon 390×844 (čistý stav, sestavení `ed451eaa38c4`) a počítač 1300×900 (stav přenesený z telefonu, sestavení `e2140682e18b` – mezi oběma průchody proběhlo nové nasazení). Ostrých hledání 6 a jedno chybné (odmítnuté serverem za 39 ms). Nic se neinstalovalo, kód se neměnil. Skripty a všechny snímky: `%TEMP%\atlas-qa\r12\` na Peterově počítači.

## Nefunguje podle zadání

1. **Brno +300 km: Pardubice v náhledu letišť jsou.** Krakov (KRK, 245 km) a Katovice (KTW, 226 km) tam jsou, ale PED Pardubice 118 km taky – na telefonu i na počítači, v obou sestaveních. Celý seznam: BRQ, BTS, VIE, PED, OSR, JCL, SLD, PRG, LNZ, WRO, KTW, KRK, GRZ, TAT, BUD, SOB, KLV. Snímky: `check-r12/m-03-letiste-300km.png`, `check-r12/d-02-letiste-300km.png`.
2. **Bangkok, řazení „Cena + délka cesty“: první zůstává nabídka bez známé délky.** Řazení v nabídce je a pořadí mění (Air China 14 h 40 min se posune z 3. na 2. místo), ale první je dál Air Arabia s „přílet ?“ a bez délky cesty, další taková je třetí a pátá. Nabídky bez známé délky se zřejmě řadí jen podle ceny. Snímek: `check-r12/m-05-bangkok-cena-delka.png`.

## Funguje

**Přehled**
- Řádek „Od minula“: po uložení dvou ♡ a nastavení cíle 2 300 Kč u Barcelony (cena 1 923 Kč) ukáže „🎯 Brno → Barcelona pod tvou cenou (1 923 Kč)“, karta „✓ splněno“, hláška „Už teď stojí 1 923 Kč – ozvu se, až cena ještě klesne“. Po znovuotevření aplikace řádek zůstane a žádné hledání se neodešle. Před nastavením cíle je řádek skrytý.
- Radar má Kdykoliv / Víkendy / 🎉 Svátky. Svátky: „prodloužený víkend 14. 11.–17. 11. (Den boje za svobodu, s volnem 16. 11.)“, 12 karet z 12 s návratem 17. 11. (odlet 13. nebo 14. 11.). Načtení 2,6 s.
- Radar Kdykoliv se načetl za 21 s a během načítání píše „Hledám nejlevnější lety z okolí – obvykle do půl minuty“; nad kartami je „Za osobu: zpáteční letenka + cesta na letiště a z letiště do města“.

**Lety**
- Telefon: po hledání se formulář sbalí do řádku „Brno → Bangkok · 17.10.–15.1. · 11–16 nocí · 2 os. ♡ ✎ Upravit“, první nabídka je 84–120 px od horního okraje (minule 866 px pod průběhem). ♡ v řádku uloží hlídání a změní se na ♥. ✎ Upravit formulář rozbalí.
- Chybné hledání (okruh 0 km, BRQ vypnuté): formulář zůstane rozbalený, chyba „V okolí jsem nenašel žádné letiště s pravidelnými lety. Zvětši okruh.“
- Počítač: formulář po hledání zůstává rozbalený.

**Cesta**
- Trasa víc míst: Barcelona (4) → Lloret de Mar (1) → Tarragona (1), autem.
- Shrnutí: řádek „⛽ Přejezdy autem – palivo (odhad, nafta 6 l/100 km) 719 Kč“. Celkem 4 565 Kč = 2 046 + 1 080 + 720 + 719, na osobu 2 283 Kč, sedí i s hlavičkou.
- Uložit do plánovače → vlastní aktivita a vlastní položka → „🧳 Otevřít v průvodci“ (vrátí stejnou trasu, krok Shrnutí) → znovu uložit: hláška „Cesta v plánovači aktualizována“, cesta je v plánovači jednou, vlastní aktivita i položka zůstaly (1 aktivita, 25 položek).

**Plánovač**
- Nová cesta „Lisabon“ → 🇵🇹, země PT. „Hledat lety“ vyhledá Lisabon s přesnými daty cesty 12.–16. 11. pro 2 osoby (4,5 s).

**Telefon**
- Kroky průvodce: 6 ikon v jednom řádku, bez posuvníku (šířka 358 z 358 px), text jen u aktivního kroku, nejmenší tlačítko 38×38 px.
- Detail země: akce (Najít lety sem, Ubytování, Do plánu, Označit jako navštívené) hned pod hlavičkou, u zemí s varováním až pod ním (Thajsko 282 px od vrchu okna, Portugalsko 180 px). Hlavní město česky: Lisabon, Varšava, Vídeň, Tbilisi, Bangkok.

**Obecně**
- Žádná chyba stránky ani konzole, žádné přetečení do šířky. Jediná odpověď 503 byla při otevření na počítači během nového nasazení (načtení 15 s).

## Poznámky
- Výsledek chybného hledání nechává viditelnou starou hlášku „Hledání uloženo…“ jen proto, že test běžel hned po ♡ – není to chyba.
- Na počítači jsem součást 3 (Cesta) neopakoval; zkontroloval jsem jen Přehled, náhled letišť, hledání, Plánovač a detail země.
