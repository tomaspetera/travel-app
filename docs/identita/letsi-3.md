# Letsi – koncept 3 „Leť si“

Návrh vizuální identity pro přejmenování aplikace ATLAS na **Letsi**. Vizuální podoba je v
[letsi-3.html](letsi-3.html) (samostatná stránka, otevřít v prohlížeči – na telefonu i na počítači). Navazuje na
[strategie.md](strategie.md): hlavní myšlenka „Kruh, ze kterého se vylétá“, paleta ze směru C „Slunce a laguna“.
V aplikaci se tímto nic nemění.

## Koncept ve dvou větách

**Slunce, ze kterého se usmívá cesta.** Kruh je slunce i okolí kolem tebe (všechna letiště v dosahu), z bodu
„ty jsi tady“ vede jediná čára, která se nejdřív usměje a pak vyletí ven jako papírová vlaštovka. Tytéž tahy písma
čtou jméno **Letsi**, výzvu **Leť si** (háček nad ť je vlaštovka) i anglické **let’s see**.

## Rozhodnutí

| Téma | Rozhodnutí | Proč |
|---|---|---|
| Značka | Slunečnicový kruh (r 42 na mřížce 128), grafitová čára 7 začínající bodem „ty“, úsměv, výlet ven, vlaštovka 1,7× dnešní ikony z `public/index.html` | Jedna kresba nese okolí, dovolenou, cestu i radost; vlaštovka je kontinuita s dnešní aplikací. Úsměv bez očí = radost, ale dospělá. |
| Slovní značka | Vlastní monolineární kresba „Letsi“ (tah 12, kulaté konce, x-výška 50, verzálka 74), tečka nad i = slunce | Kulaté konce ladí s ikonami (tah 2, kulaté konce); malá písmena jsou přátelská, verzálka L dává stabilitu. |
| Slogan | „Leť si“ = slovní značka + mezera + vlaštovka jako háček | Diakritika jako logo – česká, ale čitelná i pro cizince; jméno a slogan jsou jedna kresba. |
| Lockupy | horizontální (hlavička, web), vertikální (spouštěcí obrazovka, plakát) | Ochranná zóna = poloměr slunce. |
| Jednobarevná | cesta uvnitř slunce vyříznutá, venku plná, mezera 3 jednotky kolem slunce | Funguje pro razbu, laser, výšivku a potisk jednou barvou. |
| Ikona aplikace | laguna (#0E8EA3 → #076676) se slunečnicovým sluncem a krémovou čárou; maskable v bezpečném kruhu 80 %; záložní krémová | Mezi tmavomodrými ikonami aerolinek a hotelů jediná teplá a klidná; nekřičí jako žlutá plocha. |
| Favicona | 16 a 32 px zjednodušené (bez bodu v 16 px, silnější čára, vlaštovka ze dvou trojúhelníků) | Čitelná na světlé i tmavé liště – čára je grafitová uvnitř slunce. |
| Hlavní akcent | slunečnice jen pro hlavní tlačítko a podtržení nejlevnější ceny | Oko jde na cenu a akci; zelená zůstává jen „levněji“, červená „dražší/chyba“. |
| Písmo | Manrope (nadpisy, 700–800) + Inter (text a ceny, `tnum`) | Geometrické, přátelské, plná čeština; Inter už aplikace používá. |
| Pohyb | slunce vyjde → bod → čára se nakreslí → přiletí vlaštovka → vyletí; `prefers-reduced-motion` = statické logo | Animace vypráví koncept za 4 s; v rozhraní stejný jazyk (uložení = vlaštovka vyletí). |

## Paleta

| Role | Hex | RGB | CMYK ≈ | Použití |
|---|---|---|---|---|
| Slunečnice (primární) | `#FFB400` | 255 180 0 | 0 30 100 0 | značka, hlavní tlačítko s grafitovým textem, cena |
| Slunečnice světlá | `#FFE7A3` | 255 231 163 | 0 8 42 0 | štítky, vybrané čipy, podtržení ceny |
| Laguna (sekundární) | `#0A7C8F` | 10 124 143 | 88 28 34 12 | ikona, karta „Naplánuj“, mapa, sekundární tlačítko s bílým textem |
| Laguna tmavá | `#076676` | 7 102 118 | 92 40 38 24 | odkazy, text v barvě |
| Korál (akcent) | `#EF5A3C` | 239 90 60 | 0 76 78 0 | „nové“, odznaky, upozornění – vzácně |
| Korál tmavý | `#C2401F` | 194 64 31 | 12 85 100 4 | korálový text |
| Grafit | `#1F2328` | 31 35 40 | 76 64 55 72 | text, slovní značka |
| Kámen / mlha | `#575C64` / `#676B72` | 87 92 100 / 103 107 114 | 60 48 40 32 | vedlejší text / popisky |
| Krém | `#FFFAEF` | 255 250 239 | 0 2 7 0 | pozadí světlého režimu |
| Noc / karta | `#14161A` / `#23272D` | 20 22 26 / 35 39 45 | 78 66 58 80 | tmavý režim |

Úpravy oproti směru C: laguna zelenější (`#0B7F95` → `#0A7C8F`, dál od modrých aerolinek, bílá na ní 4,9 : 1),
korál měkčí (`#F2542D` → `#EF5A3C`, dál od červené Ryanairu a oranžové easyJetu), grafit `#1F2328`, krém `#FFFAEF`.
CMYK jsou orientační (natíraný papír), přímé barvy přibližně Pantone 7549 C / 7713 C / 7416 C – ověřit nátiskem.

## Tokeny (mapování na `public/css/atlas.css`)

| Proměnná | Světlý (hlavní) | Tmavý |
|---|---|---|
| `--bg` | `#FFFAEF` | `#14161A` |
| `--bg2` / `--surface-solid` | `#FFFFFF` | `#1C1F24` / `#23272D` |
| `--card` | `rgba(255,255,255,.86)` | `rgba(35,39,45,.9)` |
| `--border` / `--border-2` | `rgba(31,35,40,.1)` / `.18` | `rgba(246,242,234,.1)` / `.16` |
| `--text` | `#1F2328` | `#F6F2EA` |
| `--muted` | `#575C64` | `#B9B4AA` |
| `--faint` | `#676B72` | `#A39F96` |
| `--accent` (laguna) | `#0A7C8F` | `#45C2D3` |
| `--accent-ink` | `#076676` | `#45C2D3` |
| `--accent2` (korál) | `#EF5A3C` | `#FF8466` |
| `--accent3` (slunečnice) | `#FFB400` | `#FFC233` |
| `--grad` | `linear-gradient(135deg,#FFC233 0%,#FFB400 55%,#FF9A3D 100%)` | stejný |
| `--grad-warm` | `linear-gradient(135deg,#FF9A3D 0%,#EF5A3C 100%)` | stejný |
| `--good` / `--warn` / `--bad` / `--info` | `#13795B` / `#A15C00` / `#C4314B` / `#076676` | `#3DD68C` / `#FFC233` / `#FF7B8A` / `#45C2D3` |
| `--nav-bg` / `--nav-ico` | `rgba(255,255,255,.92)` / `#575C64` | `rgba(35,39,45,.88)` / `#B9B4AA` |
| `--map-sea` / `--map-land` | `#CFE8EA` / `#FFFCF6` | `#0F2A2F` / `#2A2F36` |

Na `--grad` a slunečnici je vždy grafitový obsah (bílá na slunečnici nemá ani 2 : 1). Dnešní `--grad` je pozadí
pod bílým textem – při přechodu je proto potřeba u tlačítek s gradientem změnit i barvu textu.

### Kontrast hlavních dvojic (WCAG 2, spočítáno ručně)

| Dvojice | Poměr |
|---|---|
| grafit / krém · bílá | 15,2 · 15,8 |
| kámen `#575C64` / krém | 6,5 |
| mlha `#676B72` / krém · bílá | 5,1 · 5,4 |
| grafit / slunečnice (hlavní tlačítko) | 8,9 |
| bílá / laguna `#0A7C8F` | 4,9 |
| laguna tmavá `#076676` / krém | 6,4 |
| korál tmavý `#C2401F` / krém · grafit / korál | 5,0 · 4,7 |
| levné `#13795B` · dražší `#C4314B` / bílá | 5,4 · 5,4 |
| pozor `#A15C00` / krém | 5,0 |
| slunečnice / krém | **1,7 – nikdy text** |
| `#F6F2EA` / noc · karta | 16,2 · 13,4 |
| `#A39F96` / karta `#23272D` | 5,7 |
| noc / slunečnice `#FFC233` | 11,2 |
| laguna `#45C2D3` · korál `#FF8466` / noc | 8,6 · 7,5 |

Před nasazením přepočítat nástrojem na kontrast.

## Písma

| Písmo | Použití | Licence | Odkazy |
|---|---|---|---|
| **Manrope** | nadpisy 700–800, tlačítka | SIL OFL 1.1 | [Google Fonts](https://fonts.google.com/specimen/Manrope) · [GitHub](https://github.com/sharanda/manrope) |
| **Inter** | text 400–600, ceny 700–800 s `tabular-nums` | SIL OFL 1.1 | [Google Fonts](https://fonts.google.com/specimen/Inter) · [rsms.me/inter](https://rsms.me/inter/) · [GitHub](https://github.com/rsms/inter) |

Soubory WOFF2 (podmnožina latin + latin-ext) se uloží do `public/fonts`, ne z Google Fonts (bez vnějších požadavků).
Náhled v HTML používá nejbližší systémová písma (Avenir Next / Segoe UI / Roboto, system-ui), protože stránka nic
nestahuje. Škála pro telefon: displej 32/36, H1 26/30, H2 20/26, H3 17/22, cena 28/32, text 15/22, tlačítko 15/20,
malý 13/18, popisek 12/16 (nejmenší).

## Tón hlasu (ukázky)

| Místo | Česky | English |
|---|---|---|
| Slogan | Leť si. Všechna letiště kolem tebe, jedno hledání. | Letsi – let’s see where you can fly. |
| Tlačítko | Najdi lety · Naplánuj celou cestu | Find flights · Plan the whole trip |
| Prázdný stav | Kam to bude? Napiš město, „kamkoliv“, nebo celou větu. | Where to? Type a city, “anywhere”, or a whole sentence. |
| Chyba | Tohle se teď nepovedlo načíst. Zkus to za chvíli znovu – hledání si pamatujeme. | That didn’t load just now. Try again in a moment – we kept your search. |
| Cena | Praha → Řím zlevnila na 1 490 Kč (o 380 Kč). Leť si? | Prague → Rome dropped to €59. Let’s see? |

## Rizika

- **Nízkonákladovky:** žlutá + modrá = Ryanair. Proto se slunečnice nikdy nepáruje s námořnickou modrou, druhá barva
  je zelenavá laguna a žlutá je kruh (slunce), ne plocha. Purpurové a růžové tóny (Wizz Air) paleta nemá. Korál je
  blízko oranžové easyJetu – proto jen jako vzácný akcent.
- **Žlutá a přístupnost:** slunečnice nemá kontrast pro text na světlém pozadí (1,7 : 1) – jen plochy s grafitovým
  obsahem. Při přechodu zkontrolovat všechna místa, kde dnes `--grad` nese bílý text.
- **Kolize s „varováním“:** slunečnice je zároveň barva `--warn` v tmavém režimu; varování musí mít vždy ikonu ⚠ a text.
- **Podobnost tvarů:** oblouk může vzdáleně připomínat „swoosh“ (Nike) nebo úsměv Amazonu – liší se tím, že
  začíná bodem a končí vlaštovkou uvnitř/vně kruhu; před registrací nechat posoudit rešerší ochranných známek.
- **Název není ověřený:** dostupnost `letsi.cz`/`.eu`/`.app`, ochranné známky (ÚPV, EUIPO/TMview) a sociální sítě
  nejsou zkontrolované (stejně jako ve strategii). Podobně znějící značky (např. „Letsy“, „Let’s“) prověřit.
  Doména a jméno na vizitce jsou ilustrační.
- **Kontrasty a CMYK** jsou spočítané ručně; před nasazením přepočítat nástrojem a barvy pro tisk ověřit nátiskem.
- **Ověřit Manrope:** `tnum` a všechny znaky (ľ ĺ ŕ ô ä ą ę ł ń ś ź ż) na konkrétní verzi; ceny se vždy sází Interem.
- **Zjednodušená favicona** se liší od plné značky – je to záměr, ale musí se kreslit ručně pro 16 a 32 px, ne
  zmenšovat.

## Co by se změnilo v aplikaci (jen návrh, tento koncept nic nemění)

Název v `server/brand.js`, barvy v `public/css/atlas.css` podle tabulky tokenů, písmo nadpisů Sora → Manrope,
ikony a `og-image.png`, favicona a spouštěcí obrazovka (`#launch` v `public/index.html`) podle animace v HTML.
