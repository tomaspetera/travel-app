# Letsi – vizuální identita, koncept 1 „Kruh a čára“

Návrh identity pro přejmenování aplikace (dnes ATLAS) na **Letsi** – česky „Leť si!“, anglicky zní jako „let’s see“.
Staví na hlavní myšlence ze [strategie](strategie.md) („Kruh, ze kterého se vylétá“) a na paletě směru A
„Meruňkový úsvit“. Úplný vizuální návrh (logo, paleta, písma, mockupy) je v [letsi-1.html](letsi-1.html) – samostatná
stránka bez vnějších zdrojů, otevřít v prohlížeči i na telefonu. **V aplikaci se nic nemění.**

## Koncept

Celé logo je **jedna nepřerušená čára**: obkrouží tečku uprostřed (ty, tvoje poloha) jako kruh všech letišť v okolí
a v nejvýhodnějším bodě z kruhu **vyletí ven**, kamkoliv. V nápisu je ta tečka zároveň **tečkou nad i**.

Proč je to chytré: jeden tah vypráví produkt v pořadí, v jakém funguje (ty → okolí → let ven); kruh je otevřený přesně
tam, kde čára odlétá, takže nečte se jako terč ani radar, ale jako odlet; zboku připomíná oko, které se dívá ven
(„let’s see“); při spuštění se logo samo nakreslí jedním tahem; v 16 px zůstane kroužek s ocáskem.

## Rozhodnutí

| Oblast | Rozhodnutí |
|---|---|
| Značka | Mřížka 100 × 100: kruh r 24 se středem 36,5/63,5, tah 9, tečka r 8, čára z vrcholu kruhu do pravého horního rohu (cesta `M59.05 55.29A24 24 0 1 1 36.5 39.5C52 39.5 70 30 87.5 12.5`). Kruh lehce vlevo dole, čára vede pohled nahoru doprava – dynamika startu. |
| Slovní značka | Vlastní monolineární geometrická kresba „Letsi“ (tah 10, x-výška 50, verzálka 72, kulaté konce): L = přistávací dráha, e a s z kružnic, nad i značka v malém. Žádné písmo, jen křivky. |
| Lockupy | Horizontální (x-výška nápisu = vnější průměr kruhu) a vertikální (kruh na ose nápisu). V lockupu je nad i jen korálová tečka, aby se kruh neopakoval. |
| Verze | Světlá (inkoust + korál), tmavá (krém + noční korál), na korálu (bílá + inkoustová čára), na laguně (bílá + meruňka), jednobarevná inkoust a negativ. |
| Ochranná zóna | **k** = vnější průměr kruhu značky (= x-výška nápisu) na všech stranách. |
| Minimum | Obrazovka: značka 24 px, slovní značka s kruhem 72 px šířky (pod tím verze s tečkou, min. 56 px), lockup 100 px. Tisk: 6 / 18 / 25 mm. |
| Ikona aplikace | 512 px, korálový přechod, bílá čára, inkoustová tečka; zaoblený čtverec rx 22 %, maskable s kresbou v bezpečném kruhu 80 %, tmavá varianta. |
| Favikona | Samostatně kreslená pro 16 a 32 px (silnější tah, kratší čára, větší tečka), ne zmenšenina. |
| Motiv | „Letokruhy“ – tenké soustředné kružnice a vždy jen jedna čára ven. V produktu: kruh okolí s letišti jako tečkami laguny a nejvýhodnějším odletem jako korálovou čarou. |
| Ikony | Mřížka 24, tah 2 px, kulaté konce a spoje, rohy r 2–3 – navazuje na dnešní ikony v aplikaci. Ikona polohy = značka v malém. |
| Pohyb | Spouštěcí obrazovka pod 2 s: tečka naskočí (0,4 s) → čára obkrouží a vyletí (1,15 s) → nápis vyjede (0,5 s). Respektuje `prefers-reduced-motion`. |
| Foto | Z pohledu cestovatele (okno letadla, cesta, výhled, teplé světlo), ne letadla zvenku a modré noční scény. |
| Tlačítka a ceny | Jediná barva **Žár #C93A17** (bílý text 5,1 : 1); korál #F2542D zůstává pro značku a grafiku (s bílou jen 3,5 : 1). Ve tmě noční korál #FF7A57 s tmavým textem. |

## Paleta a tokeny

| Název | Hex | RGB | CMYK (≈) | Role |
|---|---|---|---|---|
| Korál | `#F2542D` | 242 84 45 | 0 78 85 0 | primární – logo, grafika, mapa |
| Žár | `#C93A17` | 201 58 23 | 5 85 100 10 | akcent – ceny, hlavní tlačítko, odkazy |
| Laguna | `#0B7A6E` | 11 122 110 | 90 25 60 15 | sekundární – cíl, plán cesty |
| Laguna světlá | `#3CC4B2` | 60 196 178 | 65 0 38 0 | sekundární ve tmě, ilustrace |
| Meruňka | `#FFE2D3` | 255 226 211 | 0 14 16 0 | jemná plocha, tip, výběr |
| Slunce | `#FFC94D` | 255 201 77 | 0 22 78 0 | grafika, hvězdičky (jen s tmavým textem) |
| Inkoust | `#211A1E` | 33 26 30 | 60 70 60 80 | text |
| Břidlice | `#6B5D62` | 107 93 98 | 40 50 40 35 | vedlejší text |
| Mlha | `#7A6C71` | 122 108 113 | 35 45 35 25 | poznámky |
| Písek | `#F6ECE4` | 246 236 228 | 2 7 9 0 | plochy, dlaždice |
| Papír | `#FFF8F3` | 255 248 243 | 0 3 4 0 | pozadí světlého režimu |
| Noc | `#1A1416` | 26 20 22 | 60 70 65 85 | pozadí tmavého režimu |

Mapování na proměnné v `public/css/atlas.css` (až se identita bude zavádět):

| Proměnná | Světlý | Tmavý |
|---|---|---|
| `--bg` / `--bg2` | `#FFF8F3` / `#FFFFFF` | `#1A1416` / `#211A1D` |
| `--surface-solid` / `--card` | `#FFFFFF` / `rgba(255,255,255,.86)` | `#251D20` / `rgba(37,29,32,.82)` |
| `--surface` / `--surface-2` | `rgba(33,26,30,.04)` / `.07` | `rgba(255,240,232,.05)` / `.08` |
| `--border` / `--border-2` | `rgba(33,26,30,.10)` / `.18` | `rgba(255,240,232,.10)` / `.17` |
| `--text` / `--muted` / `--faint` | `#211A1E` / `#6B5D62` / `#7A6C71` | `#F7EEE9` / `#BDAEA8` / `#A99A94` |
| `--accent` | `#F2542D` | `#FF7A57` |
| `--accent-ink` (text v barvě, ceny) | `#C93A17` | `#FF7A57` |
| `--accent2` / `--accent3` | `#0B7A6E` / `#FFC94D` | `#3CC4B2` / `#FFC94D` |
| `--grad` | `linear-gradient(135deg,#FF8A5B 0%,#F2542D 55%,#E0431F 100%)` | stejné |
| `--grad-warm` | `linear-gradient(135deg,#FFC94D 0%,#F2542D 100%)` | stejné |
| nové `--btn-primary` / `--btn-primary-text` | `#C93A17` / `#FFFFFF` | `#FF7A57` / `#1A1416` |
| `--good` / `--warn` / `--bad` / `--info` | `#1F7A3D` / `#8A5A00` / `#BE1F3A` / `#0B7A6E` | `#5BD38A` / `#FFC94D` / `#FF8A9B` / `#3CC4B2` |
| `--nav-bg` / `--nav-ico` | `rgba(255,255,255,.92)` / `#6B5D62` | `rgba(37,29,32,.92)` / `#BDAEA8` |
| `--map-sea` / `--map-land` | `#CDEBE6` / `#FFFDFB` | `#14262A` / `#3A2F33` |
| `--map-cheap` / `--map-mid` / `--map-pricey` | `#1F7A3D` / `#B86E00` / `#BE1F3A` | `#5BD38A` / `#FFC94D` / `#FF8A9B` |

Kontrast (WCAG 2, spočítaný podle vzorce relativní jasnosti): inkoust na papíru 16,2; břidlice 5,9; mlha 4,7;
Žár na bílé 5,1 a na papíru 4,9; bílá na Žáru 5,1; laguna na bílé 5,2; inkoust na korálu 4,9; bílá na korálu jen 3,5
(grafika, text ≥ 24 px); ve tmě krém 15,9, noční korál 7,1, laguna světlá 8,4. Celá tabulka je v HTML.

## Písma

| Písmo | Použití | Licence | Odkaz |
|---|---|---|---|
| **Manrope** 700–800 | nadpisy | SIL OFL 1.1, latinka rozšířená | [Google Fonts](https://fonts.google.com/specimen/Manrope) · [GitHub](https://github.com/sharanda/manrope) |
| **Inter** 400–700, `tnum` | text, ceny, časy | SIL OFL 1.1, latinka rozšířená | [Google Fonts](https://fonts.google.com/specimen/Inter) · [GitHub](https://github.com/rsms/inter) |

Inter už aplikace používá – mění se jen nadpisy (dnes Sora). Obě písma hostovat přímo v `public/` jako WOFF2
(podmnožina latin + latin-ext), žádné volání Google Fonts. Náhled v HTML používá nejbližší systémová písma.
Škála pro telefon: 32/36 · 26/30 · 20/26 · 17/22 (Manrope), 16/24 · 14/20 · 12/16 (Inter), ceny 28/32 a 16/20 Inter `tnum`.

## Rizika a co ověřit

- **Název není ověřený**: doména `letsi.cz` (v mockupech jen jako příklad), ochranná známka (ÚPV, EUIPO/TMview),
  sociální sítě. „Letsi“ může být v angličtině čteno jako „let-see“ i „let-sigh“ – vyzkoušet na lidech.
- **Podobnost značky**: kroužek s tečkou se používá u ikon polohy a „cíle“; odlišuje nás otevřený kruh s čarou ven.
  Před finální volbou udělat rešerši podobných log (aerolinky, mapy, fintech).
- **Korál vs. chyba/zdražení**: červená se s korálem plete – proto karmín do fialova `#BE1F3A`, vždy s ikonou ▲/✕;
  zlevnění vždy zeleně se ▼, nikdy jen barvou.
- **Bílá na korálu** má jen 3,5 : 1 – malý text na korálu nikdy; tlačítka v Žáru.
- **Tisk**: korál a Žár jsou na hraně gamutu CMYK, CMYK hodnoty jsou orientační; doladit nátiskem (případně Pantone).
- **Tenké detaily**: kruh nad i ve slovní značce je pod 72 px příliš jemný – pod tou šířkou verze s tečkou.
- **Manrope `tnum`**: ověřit na konkrétní verzi; ceny sázet Interem.
- **Náhled** byl připravený bez vykreslení v prohlížeči v tomto prostředí – před prezentací projít stránku na telefonu
  a na počítači a doladit případné optické detaily kresby (proklad písmen, poloha kruhu v lockupu).
- Zavedení do aplikace (barvy v `atlas.css`, ikony, `og-image.png`, `server/brand.js`) je samostatná větší změna –
  jen návrh, tato změna ji nedělá.
