# Návrh identity C – „Mapa“

Ukázka: [varianta-c.html](varianta-c.html) (samostatná stránka, otevře se i bez sítě). V aplikaci se zatím nic nemění.

## Myšlenka

ATLAS = kniha map. Místo dnešního neonového přechodu (tyrkys → modrá → fialová) klidné barvy mapy: **hluboká
petrolej** a mořská zelená (moře), **písek** (papír mapy, pevnina) a jediný hlasitý akcent – **rumělka** – jen pro
ceny a hlavní tlačítko. Motiv vrstevnic a poledníků je jemně v pozadí (hlavní karta, ikona), nikdy pod textem.

**Značka: kompasová růžice** – čtyři hroty v kruhu, severní hrot v barvě akcentu. Je jednoduchá (kruh + hvězda), ve
48 px zůstane čitelná, funguje sama jako ikona a favicon a vedle ní nápis **ATLAS** systémovým písmem s prostrkáním
(bez Google Fonts). Proti „globusu s trasou“ se nerozpadne v malé velikosti, proti „A jako špendlík“ se neplete
s ikonou map.

## Proč se hodí pro levné letenky a plánování celé dovolené

- **Cena je hned vidět.** Všechno ostatní je tlumené, takže rumělková cena („1 290 Kč/os.“) a tlačítko „Najít lety“
  jsou jediné výrazné body obrazovky – oko je najde i na slunci.
- **Kompas = směr, ne jen let.** ATLAS neumí jen letenku, ale celou cestu (ubytování, program, Na cestě). Kompas
  a mapa říkají „naplánuju ti cestu“, ne „prodám ti sedadlo“.
- **Klid a důvěra.** Petrolej a písek působí spolehlivě, ne jako slevový leták; pořád moderně díky bezpatkovému písmu,
  velkým zaobleným kartám a ploché ikoně (žádné staré mapy, pergamen ani patkové písmo).
- **Navazuje na to, co už v aplikaci je.** Mapy v aplikaci jsou už teď „světlé jako atlas“ (`--map-*`), nová paleta
  k nim sedí.

## Hodnoty pro proměnné v `public/css/atlas.css`

Kontrast podle WCAG 2.1 (relativní jas), počítaný proti nejtmavší ploše, na které text leží (světlý: `--bg`, bílá
karta je světlejší → kontrast vyšší), resp. proti nejsvětlejší ploše (tmavý: `--surface-solid`). Požadavek: text
aspoň 4,5 : 1, velké prvky a grafika aspoň 3 : 1.

### `[data-theme="light"]` (hlavní uživatel)

| Proměnná | Hodnota | Kontrast (vůči `--bg` / bílé) | K čemu |
|---|---|---|---|
| `--accent` | `#0f5c63` | 6,7 / 7,7 : 1; bílý text na ní 7,7 : 1 | petrolej – aktivní prvky, čipy, okraje výběru |
| `--accent2` | `#b8400f` | 4,8 / 5,6 : 1; bílý text na ní 5,6 : 1 | rumělka – **ceny a hlavní tlačítko** |
| `--accent3` | `#9c7636` | 3,6 / 4,2 : 1 – jen grafika a velké prvky | okr – vrstevnice, ikonky, oddělovače |
| `--accent-ink` | `#0b5a60` | 6,9 / 7,9 : 1 | odkazy „Obnovit →“, „změnit“ |
| `--grad` | `linear-gradient(135deg,#0f5c63 0%,#1d7470 55%,#2c8378 100%)` | bílý text na nejsvětlejším místě 4,5 : 1 | hlavní karta, značka |
| `--bg` | `#f3efe6` | – | písek, pozadí stránky |
| `--bg2` | `#fbf9f4` | – | papír |
| `--surface-solid` | `#ffffff` | – | okna, hledací karta |
| `--card` | `rgba(255,255,255,.86)` | – (světlejší než `--bg`) | karty |
| `--text` | `#12302f` | 12,3 / 14,1 : 1 | inkoust |
| `--muted` | `#466260` | 5,8 / 6,6 : 1 | popisky polí, „/os.“ |
| `--faint` | `#526a67` | 5,1 / 5,8 : 1 | trasa a termín, nápovědy (slabší než `--muted`) |
| `--good` | `#047857` | 4,8 / 5,5 : 1 | levně, ✓ |
| `--warn` | `#8a5a00` | 5,1 / 5,9 : 1 | pozor |
| `--bad` | `#be123c` | 5,5 / 6,3 : 1 | draze, smazat |
| `--nav-bg` | `rgba(251,249,244,.94)` | – | spodní lišta (papír) |
| `--nav-line` | `rgba(18,48,47,.1)` | – | okraj lišty |
| `--nav-ico` | `#4a6461` | 6,0 : 1 na liště | ikony a popisky lišty |
| aktivní položka lišty | pozadí `#12302f`, text `#ffffff` | 14,1 : 1 | dnes `.mobile-nav .mi.active{background:#0f1830}` |

### `[data-theme="dark"]`

| Proměnná | Hodnota | Kontrast (vůči `--surface-solid` / `--bg`) | K čemu |
|---|---|---|---|
| `--accent` | `#4fb3ad` | 5,2 / 6,8 : 1; text `#0b1f22` na ní 6,8 : 1 | mořská zelená |
| `--accent2` | `#ff8a5c` | 5,6 / 7,3 : 1; text `#0b1f22` na ní 7,3 : 1 | světlá rumělka – ceny a tlačítko |
| `--accent3` | `#d8bf8a` | 7,3 / 9,5 : 1 | světlý okr |
| `--accent-ink` | `#7dd3c8` | 7,5 / 9,7 : 1 | odkazy |
| `--grad` | `linear-gradient(135deg,#0f3d42 0%,#13494d 55%,#16575a 100%)` | bílý text 8,3 : 1 a víc | hlavní karta |
| `--bg` | `#0b1f22` | – | noční moře |
| `--bg2` | `#0f272b` | – | |
| `--surface-solid` | `#163539` | – | okna, hledací karta |
| `--card` | `rgba(22,53,57,.72)` | – (tmavší než `--surface-solid`) | karty |
| `--text` | `#eef3ee` | 11,7 / 15,1 : 1 | |
| `--muted` | `#a6bbb6` | 6,5 / 8,4 : 1 | |
| `--faint` | `#93aaa5` | 5,3 / 6,9 : 1 | |
| `--good` | `#34d399` | 6,8 / 8,8 : 1 | (stejné jako dnes) |
| `--warn` | `#fbbf24` | 7,9 / 10,2 : 1 | (stejné jako dnes) |
| `--bad` | `#fb7185` | 4,9 / 6,3 : 1 | (stejné jako dnes) |
| `--nav-bg` | `rgba(23,58,64,.88)` | – | |
| `--nav-line` | `rgba(238,243,238,.1)` | – | |
| `--nav-ico` | `rgba(238,243,238,.68)` | 6,2 : 1 na liště | |
| aktivní položka lišty | pozadí `#4fb3ad`, text `#0b1f22` | 6,8 : 1 | |

### `theme_color`

- `manifest.webmanifest`: `"theme_color": "#f3efe6"`, `"background_color": "#f3efe6"` – hlavní uživatel je ve světlém
  režimu, úvodní obrazovka aplikace na ploše tak nebude tmavá.
- `<meta name="theme-color">`: světlý `#f3efe6`, tmavý `#0b1f22` (v `index.html` dvakrát – meta značky i skript při
  startu – a v `pwa.js`).

## Na co myslet při zavedení (není součástí návrhu)

- **Tlačítko na rumělce má v tmavém režimu tmavý text** (`#0b1f22`); bílý by měl jen 2,3 : 1. Dnes má
  `.btn.primary` vlastní barvy (`[data-theme="light"] .btn.primary{background:#0f1830}`) – bude potřeba upravit
  i toto pravidlo, nejen proměnné.
- `--good`, `--warn`, `--bad` jsou dnes společné v `:root` (jasné barvy pro tmavý režim) a světlý režim je přepisuje
  po jednotlivých pravidlech (`#047857`, `#8a5a00`, `#be123c`). Hodnoty výše počítají s tím, že by se přesunuly do
  motivů.
- V atlas.css je víc natvrdo zapsaných modrých odstínů (`#2f5fd0`, `#8fb0ff`, `rgba(91,140,255,…)`, fialová v
  `--bg-grad`) – ty by šly nahradit `--accent-ink` / `--accent`.
- Hledací karta je v návrhu **plná** (bílá / `#163539`), ne sklo na fotce: štítky „Odkud / Kam“ tak mají kontrast
  5,8 : 1 a víc místo průhledné bílé na fotce. Fotky cílů v hlavní kartě a v radaru můžou zůstat – v ukázce je
  místo nich výřez mapy jen proto, že stránka nesmí nic stahovat zvenku.
- Nová ikona znamená nové PNG (`scripts/build-icons.mjs`), favicon v `index.html` a vlaštovku v úvodní animaci
  (`#launch`) nahradit růžicí, nebo ponechat jako animaci letu.
- Hledací karta v aplikaci má nadpis „Kam poletíme?“ (ne „Kam letíš“) – ukázka drží skutečný text.
