# Identita A „Evoluce“

Náhled: [varianta-a.html](varianta-a.html) (otevřít v prohlížeči, funguje bez sítě). Je to jen návrh, aplikace
(`public/`) se nemění.

## Myšlenka

ATLAS zůstane poznat: stejný přechod tyrkysová → modrá → fialová a stejné papírové letadlo ze dvou trojúhelníků.
Mění se způsob použití:

- **Přechod jen ve značce** (ikona, logo, 4px proužek nahoře na úvodní kartě). Plochy, tlačítka a štítky jsou plné.
- **Méně záře a skla**: úvod bez aurory a zrna, karty plné (bez průhlednosti a rozmazání), stíny krátké a modrošedé.
- **Jedna hlavní modrá** `#2f62e8` pro tlačítka (bílý text 5,2 : 1), tmavší `#2553c9` pro odkazy na světlém.
- **Silnější logo**: značka + nápis ATLAS tučně a mírně prostrčený (`letter-spacing:.06em`); k letadlu přibyla čárkovaná
  stopa, takže značka říká „cesta“, ne jen „let“.
- **Signální barvy, které jdou přečíst na slunci**: ve světlém režimu tmavá zelená, oranžová a červená.

## Proč se hodí pro levné letenky a celou dovolenou

- Levné letenky potřebují důvěru. Klidná, čistá plocha s jasnou cenou působí spolehlivěji než svítivé přechody, které
  připomínají reklamu. Cena a štítek „nejlevnější“ jsou na kartě to nejvýraznější.
- Papírové letadlo zůstává: je levné, lehké a „udělej si sám“, stejně jako skládání cesty z levných letů.
- Čárkovaná stopa za letadlem ukazuje trasu. To sedí na plánování celé dovolené: let, ubytování, program i cenu celkem.
- Uživatel, který ATLAS zná, nemusí nic přeučovat: barvy, letadlo, rozložení i spodní lišta zůstávají.

## Hodnoty pro CSS proměnné (`public/css/atlas.css`)

Kontrast je poměr podle WCAG 2.x. Měřený vůči pozadí `--bg`, kartě `--card` a dlaždici nebo poli uvnitř karty
(světlý `#eef1f7`, tmavý `#1b2440`). Nejnižší hodnota je tučně. Požadavek: text aspoň 4,5 : 1, velké prvky
(tlačítka, ikony, značka) aspoň 3 : 1.

### `[data-theme="light"]` – hlavní (telefon ve dne)

| Proměnná | Dnes | Varianta A | Kontrast (bg / karta / dlaždice) |
|---|---|---|---|
| `--accent` | `#5b8cff` | `#2f62e8` | bílý text na něm **5,2** · vůči bg 4,8 |
| `--accent2` | `#a855f7` | `#7a45d8` | bílý text 5,7 · vůči bg **5,2** |
| `--accent3` | `#22d3ee` | `#0a7690` | **4,8** / 5,2 / 4,6 |
| `--accent-ink` | `#2f5fd0` | `#2553c9` | **6,1** / 6,6 / 5,9 |
| `--grad` | `#22d3ee → #5b8cff → #a855f7` | `linear-gradient(135deg,#0b9dbd 0%,#3366ee 50%,#7a45d8 100%)` | bílé letadlo na nejsvětlejším místě **3,2** |
| `--bg` | `#eef2fb` | `#f3f5fa` | – |
| `--bg2` | `#ffffff` | `#ffffff` | – |
| `--surface-solid` | `#ffffff` | `#ffffff` | – |
| `--card` | `rgba(255,255,255,.8)` | `#ffffff` (plná) | – |
| `--text` | `#0f1830` | `#101828` | 16,3 / 17,8 / **15,7** |
| `--muted` | `#56638a` | `#4f5b7a` | 6,2 / 6,8 / **6,0** |
| `--faint` | `#606d92` | `#5f6b88` | 4,9 / 5,3 / **4,7** |
| `--good` | `#34d399` | `#047857` | 5,0 / 5,5 / **4,9** |
| `--warn` | `#fbbf24` | `#a8500a` | 5,0 / 5,5 / **4,9** |
| `--bad` | `#fb7185` | `#c4244a` | 5,2 / 5,7 / **5,0** |
| `--nav-bg` | `rgba(255,255,255,.9)` | `#ffffff` | – |
| `--nav-line` | `rgba(13,22,48,.09)` | `rgba(16,24,40,.1)` | – |
| `--nav-ico` | `#5a6687` | `#56627f` | na liště **6,1** |
| aktivní položka lišty | `#0f1830`, text bílý | `#101828`, text bílý | **17,8** |

### `[data-theme="dark"]`

| Proměnná | Dnes | Varianta A | Kontrast (bg / karta / dlaždice) |
|---|---|---|---|
| `--accent` | `#5b8cff` | `#2f62e8` (stejná jako světlý) | bílý text na něm 5,2 · tlačítko vůči bg **3,6** |
| `--accent2` | `#a855f7` | `#a78bfa` | **7,0** vůči bg |
| `--accent3` | `#22d3ee` | `#22c5e0` | **9,1** vůči bg |
| `--accent-ink` | `#5b8cff` | `#86a6ff` | 8,0 / 7,2 / **6,5** |
| `--grad` | jako výš | stejný jako světlý | – |
| `--bg` | `#080c1a` | `#0b1020` | – |
| `--bg2` | `#0b1226` | `#0f1629` | – |
| `--surface-solid` | `#111a32` | `#141c31` | – |
| `--card` | `rgba(20,28,52,.66)` | `#141c31` (plná) | – |
| `--text` | `#eaf0ff` | `#e8edf8` | 16,1 / 14,4 / **13,0** |
| `--muted` | `#94a3c8` | `#a3aec8` | 8,5 / 7,6 / **6,9** |
| `--faint` | `#8692b6` | `#8f9bba` | 6,8 / 6,1 / **5,5** |
| `--good` | `#34d399` | `#34d399` | 9,9 / **8,8** |
| `--warn` | `#fbbf24` | `#fbbf24` | 11,3 / **10,1** |
| `--bad` | `#fb7185` | `#fb7185` | 7,0 / **6,3** |
| `--nav-bg` | `rgba(24,33,64,.8)` | `#172038` | – |
| `--nav-line` | `rgba(255,255,255,.1)` | `rgba(255,255,255,.08)` | – |
| `--nav-ico` | `rgba(234,240,255,.6)` | `#a9b4cc` | na liště **7,8** |
| aktivní položka lišty | bílá, text `#0b1226` | bílá, text `#0b1020` | **18,9** |

Co dál s pozadím: `--bg-grad` by v obou režimech byl jen plnou barvou `--bg` (bez dvou radiálních září).

### `theme_color` pro manifest

- `public/manifest.webmanifest`: `"theme_color": "#f3f5fa"`, `"background_color": "#f3f5fa"` – hlavní uživatel je ve
  světlém režimu, start z plochy pak neblikne tmavě. Dnes je obojí `#080c1a`.
- `<meta name="theme-color">` v `public/index.html` zůstává dvojí: `#f3f5fa` pro světlý a `#0b1020` pro tmavý režim.
- Kompromis: kdo má tmavý režim, uvidí při startu z plochy krátce světlou plochu, než se načte stránka.

## Nálezy k dnešní aplikaci (neměněno – je to jen návrh)

- Ve světlém režimu se `--good`, `--warn` a `--bad` nepřepisují. Na pozadí `#eef2fb` tak mají jen asi 1,7 : 1
  (`#34d399`), 1,5 : 1 (`#fbbf24`) a 2,4 : 1 (`#fb7185`). Týká se to například štítků `.b.good` a `.b.warn` u výsledků.
  Opravená jsou jen některá místa (`.kv .safe-mid`, `.rt-warn`, `.route-sum.warn` mají `#8a5a00`).
- Ikona v hlavičce a na startu (`#launch`) má přechod od `#22d3ee`. Bílé letadlo na něm má asi 1,8 : 1. Ve variantě A
  začíná přechod na `#0b9dbd` (3,2 : 1).
- Hledací karta na úvodu se v aplikaci jmenuje „Kam poletíme?“ (ne „Kam letíš“), proto ji tak ukazuje i náhled.

## Postup, kdyby se varianta přijala (návrh, ne součást této změny)

1. Vyměnit hodnoty proměnných v `atlas.css` podle tabulek výše a `--bg-grad` nahradit plnou barvou.
2. Úvod (`.hero-bg`, `.hero-aurora`, `.hero-grain`) nahradit plnou kartou s proužkem `--grad`.
3. Překreslit ikony v `public/icons/` ze symbolu v `varianta-a.html` a upravit `#launch` a `.brand-logo`.
4. Zkontrolovat místa s pevnými barvami (`#5b8cff`, `rgba(91,140,255,…)` ve stínech a výběru).
