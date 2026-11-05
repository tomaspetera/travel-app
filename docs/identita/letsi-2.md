# Letsi – vizuální identita, koncept 2 „Let's see“

Návrh identity pro aplikaci, která se dnes jmenuje ATLAS. Náhled se vším (logo, paleta, písmo, prvky, mockupy,
tón) je v [letsi-2.html](letsi-2.html) – samostatná stránka bez vnějších zdrojů, otevřít v prohlížeči i na telefonu.
**Nic v aplikaci se nemění**, je to podklad k rozhodnutí. Navazuje na [strategie.md](strategie.md).

## Shrnutí rozhodnutí

- **Název:** Letsi – česky „Leť si!“ (užij si to, leť kam chceš), anglicky zní jako „let's see“.
- **Koncept „Průhled“:** jeden kruh je čočka, okénko letadla i oko. Uprostřed je bod „ty“, z mezery v kruhu vpravo
  nahoře vychází slunce – cíl, na který se díváš. Nejdřív uvidíš všechny možnosti a ceny najednou (*let's see*),
  pak vyrazíš (*leť si*). Navazuje na hlavní myšlenku strategie „Kruh, ze kterého se vylétá“: kruh = všechna letiště
  kolem tebe, bod = ty, slunce v mezeře = odlet.
- **Proč je to chytré:** jeden tvar nese čtyři významy (oko, okénko, kruh letišť, slunce nad obzorem); zornice je
  lehce natočená ke slunci, takže značka má pohled a směr; **slunce spojuje všechno** – je to tečka nad „i“ ve slovní
  značce, barva ceny v aplikaci i hlavního tlačítka. Otevřený kruh nic neschovává = průhledné ceny = důvěra.
- **Značka:** mřížka 100 × 100, kruh r 32, tah 13, oblé konce, mezera 70° (od −10° do −80°), zornice r 10 posunutá
  o (3, −3) ke slunci, slunce r 9 ve vzdálenosti 38 pod úhlem −45°.
- **Slovní značka:** vlastní kresba, monolineární geometrický tah 12 s oblými konci, kulaté „e“ (navazuje na kruh),
  „s“ ze dvou elips, tečka nad „i“ = slunce posunuté doprava („odlétá“). V náhledu jako SVG tahy – pro výrobu
  převést na obrysy a opticky doladit přesahy oblých tvarů a prostrkání.
- **Lockupy:** horizontální (hlavní – kruh sahá od verzálky po účaří) a vertikální. Ochranná zóna 2 s kolem loga
  (s = průměr slunce), samostatná značka 25 % šířky. Minimum: lockup 84 px / 20 mm, slovní značka 56 px / 14 mm,
  značka 24 px / 6 mm; pod 24 px vlastní kresba faviconu (silnější tah, mezera 90°, tmavší slunce `#F5A800` v 16 px).
- **Ikona aplikace:** máta s přechodem do hlubší máty vpravo nahoře, kde vychází slunce (slunce na `#08805D`
  ≈ 3,0 : 1, na čisté mátě by mělo jen 1,6 : 1). Bílý kruh, inkoustová zornice. Maskable verze se značkou uvnitř
  bezpečné zóny 80 %.
- **Barvy – signál ceny:** máta = značka a plochy, zelený inkoust = text, **slunce = výhradně cena a hlavní akce**.
  Zlevnění = *obrácená cenovka* (inkoust + slunce, ▼ a procenta), zdražení = korál s ▲. Máta se u cen nepoužívá
  nikdy, takže zelená značka nesplývá se „zlevnilo“ (riziko směru B ze strategie).
- **Písmo:** Manrope (nadpisy) + Inter (text a ceny s `tabular-nums`) – volba 1 ze strategie.
- **Grafika:** motiv „Letokruhy“ (opakovatelný vzor soustředných kruhů) a „Obzor“ (kruhy jako vlny kolem tebe,
  slunce a tečkovaná trasa), ikony obrysové 2 px na mřížce 24 s oblými konci, fotografie vždy z pohledu cestovatele
  (okénko, výhled), ořez do kruhu nebo tvaru okénka. Animace spouštěcí obrazovky: kruh se nakreslí → oko se otevře
  → slunce vyletí mezerou ven → slovní značka, do 1,6 s, s ohledem na `prefers-reduced-motion`.

## Paleta

CMYK je přibližný odhad pro křídový papír – před tiskem ověřit nátiskem nebo vzorníkem Pantone.

| Barva | Hex | RGB | CMYK ≈ | Role |
|---|---|---|---|---|
| Máta | `#12B886` | 18, 184, 134 | 76 / 0 / 60 / 0 | primární – značka, plochy (text na ní jen inkoustem) |
| Máta hluboká | `#0A7A58` | 10, 122, 88 | 88 / 22 / 74 / 12 | odkazy, text v barvě, ikony na bílé, tlačítko s bílým textem |
| Zelený inkoust | `#0E2A21` | 14, 42, 33 | 82 / 50 / 70 / 72 | sekundární – text, logo, tmavé plochy |
| Slunce | `#FFC145` | 255, 193, 69 | 0 / 28 / 80 / 0 | akcent – ceny, hlavní tlačítko, tečka nad „i“ |
| Obloha | `#BFE6F2` | 191, 230, 242 | 25 / 0 / 5 / 0 | doplňková – moře na mapě, ilustrace |
| Korál | `#E5484D` (text `#C42F35`) | 229, 72, 77 | 0 / 82 / 62 / 0 | zdražilo, chyba |
| Vzduch | `#F3FBF7` | 243, 251, 247 | 4 / 0 / 3 / 0 | pozadí (světlý režim) |
| Mlha | `#E2F0E9` | 226, 240, 233 | 12 / 0 / 9 / 0 | dlaždice, pole, oddělovače |
| Šalvěj | `#4D655C` | 77, 101, 92 | 65 / 38 / 55 / 30 | vedlejší text |
| Kámen | `#586C64` | 88, 108, 100 | 60 / 35 / 52 / 25 | popisky a poznámky |
| Noc / karta | `#0A1612` / `#142620` | 10, 22, 18 / 20, 38, 32 | jen obrazovka | tmavý režim |
| Máta noc / Slunce noc | `#3DDBA6` / `#FFC94D` | 61, 219, 166 / 255, 201, 77 | jen obrazovka | tmavý režim |

## Tokeny (mapování na `public/css/atlas.css`)

Jen návrh pro budoucí přejmenování; `--price-*` a `--drop-*` by byly nové proměnné.

| Proměnná | Světlý | Tmavý | Poznámka |
|---|---|---|---|
| `--bg` | `#F3FBF7` | `#0A1612` | Vzduch / Noc |
| `--bg2`, `--surface-solid` | `#FFFFFF` | `#142620` | karta, okno |
| `--card` | `rgba(255,255,255,.86)` | `rgba(20,38,32,.72)` | průsvitná karta |
| `--surface` / `--surface-2` | `rgba(14,42,33,.04/.07)` | `rgba(232,245,239,.05/.08)` | dlaždice |
| `--border` / `--border-2` | `rgba(14,42,33,.10/.18)` | `rgba(232,245,239,.10/.17)` | okraje |
| `--text` | `#0E2A21` | `#E8F5EF` | zelený inkoust |
| `--muted` | `#4D655C` | `#A3BDB3` | Šalvěj |
| `--faint` | `#586C64` | `#8FA99F` | Kámen |
| `--accent` | `#12B886` | `#3DDBA6` | máta |
| `--accent2` | `#FFC145` | `#FFC94D` | slunce |
| `--accent3` | `#BFE6F2` | `#7CCDE6` | obloha |
| `--accent-ink` | `#0A7A58` | `#3DDBA6` | odkazy, text v barvě |
| `--grad` | `linear-gradient(135deg,#12B886,#8FDDB4 55%,#FFC145)` | totéž | máta → slunce |
| `--grad-warm` | `linear-gradient(135deg,#FFC145,#FF9466)` | totéž | teplé zvýraznění |
| `--good` | `#0A7A58` | `#3DDBA6` | „v pořádku“, **ne** cena |
| `--warn` | `#9A5B00` | `#FFC94D` | upozornění |
| `--bad` | `#C42F35` | `#FF8A8D` | zdražilo, chyba |
| `--info` | `#1F7A99` | `#7CCDE6` | informace |
| `--price-bg` / `--price-ink` | `#FFC145` / `#0E2A21` | `#FFC94D` / `#0A1612` | cenovka, hlavní tlačítko |
| `--drop-bg` / `--drop-ink` | `#0E2A21` / `#FFC145` | průhledná s obrysem / `#FFC94D` | zlevnění |
| `--nav-bg` / `--nav-ico` | `rgba(255,255,255,.94)` / `#4D655C` | `rgba(20,38,32,.94)` / `#A3BDB3` | spodní lišta |
| `--map-sea` / `--map-land` | `#CDEBF3` / `#FDFCF7` | `#0C1D24` / `#22382F` | mapa |
| `--map-cheap/mid/pricey` | `#0A7A58` / `#C98500` / `#D6383D` | `#3DDBA6` / `#FFC94D` / `#FF8A8D` | stupnice na mapě |

### Kontrast (WCAG 2.1, spočítáno z relativní jasnosti)

| Dvojice | Poměr | |
|---|---|---|
| Inkoust na Vzduchu / bílé | 14,5 / 15,3 | AAA |
| Šalvěj na Vzduchu / bílé / Mlze | 6,0 / 6,3 / 5,4 | AA |
| Kámen na Vzduchu / bílé / Mlze | 5,3 / 5,6 / 4,8 | AA |
| Máta hluboká na bílé / Vzduchu; bílá na Mátě hluboké | 5,3 / 5,1; 5,3 | AA |
| Inkoust na Mátě | 6,0 | AA |
| Bílá na Mátě; Máta na bílé | 2,6 | ✗ – jen logo a velké plochy |
| Inkoust na Slunci; Slunce na Inkoustu | 9,5 | AAA |
| Korál tmavý na bílé / Vzduchu | 5,5 / 5,2 | AA |
| Varování `#9A5B00` / Info `#1F7A99` na bílé | 5,4 / 4,9 | AA |
| Tmavý: text na Noci / kartě | 16,5 / 14,1 | AAA |
| Tmavý: muted na Noci / kartě; faint na kartě / dlaždici `#1C3029` | 9,2 / 7,9; 6,3 / 5,5 | AA+ |
| Tmavý: Máta noc na kartě; Noc na Slunci noc; Slunce noc na kartě | 9,0; 12,1; 10,3 | AAA |

## Písma

Obě SIL Open Font License 1.1 (zdarma i komerčně), stáhnout a hostovat přímo v `public/` – bez načítání
z Google Fonts. Plná čeština, slovenština i polština.

| Písmo | Použití | Odkaz |
|---|---|---|
| **Manrope** 700–800 | nadpisy, velká čísla v nadpisech | <https://fonts.google.com/specimen/Manrope> · zdroj <https://github.com/sharanda/manrope> |
| **Inter** 400–800 | text, formuláře, **všechny ceny** (`font-variant-numeric: tabular-nums`) | <https://fonts.google.com/specimen/Inter> · zdroj <https://github.com/rsms/inter> |

Inter už aplikace používá, změna by se týkala jen nadpisů (dnes Sora). Náhled v HTML písma nenačítá a sází
nejbližšími systémovými (`ui-rounded` / SF Pro Rounded / Segoe UI pro nadpisy, `system-ui` pro text).
Škála pro telefon: Display 32/36 800 · H1 26/30 800 · H2 20/26 700 · H3 17/22 700 · cena velká 28 800 · cena
v seznamu 16 800 · text 15/22 · pole 16 (kvůli přiblížení na iPhonu) · malý 13/18 · štítek 11 verzálky +0,07 em.

## Rizika

- **Název a známka nejsou ověřené.** „Letsi“ může kolidovat s existujícími firmami nebo aplikacemi; doména
  `letsi.cz` (použitá v mockupech) i ochranná známka (ÚPV, EUIPO/TMview) a profily na sociálních sítích je
  nutné prověřit před rozhodnutím.
- **Výslovnost a čtení:** Čech čte „leť si“, Angličan „let's see“, Němec „letsi“ – dvojí čtení je záměr, ale
  bez kontextu může působit jako překlep. Slogan by měl hru vysvětlit („Leť si. / Let's see.“).
- **Máta vs. „levné“:** zelená značka by mohla splývat se zlevněním – řeší to pravidlo „slunce = cena“
  a obrácená cenovka. Výjimka je mapa, kde stupnice zelená → žlutá → červená zůstává (je všeobecně srozumitelná);
  na mapě se proto používá Máta hluboká, ne značková máta.
- **Žlutá a nízkonákladovky:** slunečná žlutá připomíná Ryanair/Wizz. Tady je jen akcent ceny, ne plocha
  značky; k levným letenkám to ale sedí.
- **Máta na bílé má jen 2,6 : 1.** Jen logo a velké plochy; ikony a tenké čáry v Mátě hluboké. Bílý text na mátě
  nikdy.
- **Slunce na mátě má 1,6 : 1.** V ikoně aplikace je proto přechod do hlubší máty; na čisté mátě se logo sází
  s bílým kruhem nebo jednobarevně.
- **Kresba je koncept.** Slovní značka a značka jsou v náhledu SVG tahy s oblými konci – pro výrobu převést na
  obrysy, opticky vyrovnat (kulatá „e“ a „s“ přesahují účaří a x-výšku), doladit prostrkání a ověřit v tisku
  od 6 mm.
- **CMYK a kontrasty:** CMYK jsou odhady; kontrasty jsou spočítané vzorcem WCAG ručně – před implementací přepočítat
  nástrojem. `tnum` u Manrope ověřit na konkrétní verzi (ceny se jím stejně nesází).
- **Ceny a texty v mockupech jsou ilustrační** (Lisabon 1 890 Kč, „Z Vídně o 1 200 Kč levněji“) – v reklamě
  musí být skutečné a ověřitelné.
