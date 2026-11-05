# Vizuální identita ATLAS – varianta B „Slunce a cesta“

Návrh, v aplikaci se zatím nic nemění. Ukázka (logo, ikona, paleta, úvodní obrazovka ve světlém i tmavém režimu):
[varianta-b.html](varianta-b.html) – otevřít v prohlížeči přímo ze souboru, nepotřebuje síť.

## Myšlenka

Značka je **slunce nad obzorem a pod ním cesta, která k němu vede**. Tři jednoduché tvary (půlkruh, čára, zužující se
lichoběžník) v tmavě modré dlaždici, vedle nápis **ATLAS** tučným systémovým písmem s prostrkáním. Žádné paprsky,
obličeje ani letadýlko – v 48 px zůstane čitelná a nepůsobí dětsky.

- **Proč se hodí:** ATLAS nejen najde levnou letenku, ale poskládá celou dovolenou (ubytování, program, cena celkem).
  Cesta k obzoru je ta cesta – od hledání ceny k dovolené – a slunce slibuje, kam vede. Letadlo nebo kompas by říkaly
  jen „let“ nebo „navigace“.
- **Teplo a důvěra:** korálová, meruňková a sluneční jsou jen akcent a značka. Text, ceny a hlavní tlačítko jsou
  v hluboké námořnické modré (#10223f) na krémovém pozadí – stránka, kde lidi porovnávají ceny a pak platí, má působit
  klidně a věcně, ne jako cestovní leták.
- **Telefon ve světlém režimu na prvním místě:** krémové pozadí #fbf6f0 je teplejší a méně oslnivé než bílá, karty
  zůstávají bílé, takže se od pozadí oddělí i bez tmavých stínů. Všechny texty mají aspoň 4,5 : 1 i na slunci.
- **Logo:** na světlém pozadí vždy v dlaždici (samotné žluté slunce by na bílé nebylo vidět), na tmavém pozadí bez
  dlaždice, obzor a nápis krémovou #f7f0e7. Ikona aplikace = dlaždice; obsah leží v bezpečném kruhu 80 %, takže jde
  použít i jako maskovatelná ikona (`"purpose": "any maskable"`).

## Hodnoty pro proměnné v `public/css/atlas.css`

Kontrast podle WCAG 2.1 (relativní jas sRGB). U textu proti pozadí stránky (`--bg`) a proti kartě nebo oknu
(`--surface-solid`; ve světlém režimu bílá, v tmavém nejsvětlejší plocha – tedy nejhorší případ). Požadavek: text
≥ 4,5 : 1, velké prvky a ikony ≥ 3 : 1.

| Proměnná | Světlý `[data-theme=light]` | Kontrast (pozadí / karta) | Tmavý `[data-theme=dark]` | Kontrast (pozadí / karta) |
|---|---|---|---|---|
| `--accent` | `#c2401f` | jako text 4,8 / 5,2; bílý text na ní 5,2 | `#cc4620` | jen plocha: bílý text na ní 4,7; plocha vůči pozadí 3,8, kartě 3,2, liště 3,1 |
| `--accent2` | `#f98a4b` | jen ozdoby (2,2 vůči pozadí); tmavě modrý text na ní 6,6 | `#f98a4b` | jen ozdoby |
| `--accent3` | `#ffc23d` | jen ozdoby (1,5); tmavě modrý text na ní 9,9 | `#ffc23d` | vůči pozadí 11,2 |
| `--accent-ink` | `#b23c1f` | 5,5 / 5,9 | `#ff8f6b` | 8,0 / 6,8 |
| `--grad` | `linear-gradient(135deg,#c2401f 0%,#9c3a4f 55%,#10223f 100%)` | bílý text na všech barvách ≥ 5,2 (#9c3a4f 6,8; #10223f 15,9) | stejný | stejný; začátek vůči pozadí 3,5 |
| `--bg` | `#fbf6f0` | – | `#0b1729` | – |
| `--bg2` | `#ffffff` | – | `#0f1e35` | – |
| `--surface-solid` | `#ffffff` | – | `#14263f` | – |
| `--card` | `rgba(255,255,255,.85)` | – | `rgba(20,38,63,.72)` | – |
| `--text` | `#10223f` | 14,8 / 15,9 | `#f7f0e7` | 15,9 / 13,5 |
| `--muted` | `#4b5872` | 6,7 / 7,2 | `#b7bfce` | 9,7 / 8,2 |
| `--faint` | `#5a6680` | 5,4 / 5,8 | `#9ea8bb` | 7,5 / 6,4 |
| `--good` | `#0b7a52` | 5,0 / 5,4 | `#4fd69a` | 9,8 / 8,3 |
| `--warn` | `#8f5300` | 5,7 / 6,2 | `#ffc65c` | 11,5 / 9,8 |
| `--bad` | `#be2b37` | 5,4 / 5,8 | `#ff8189` | 7,5 / 6,3 |
| `--nav-bg` | `rgba(255,255,255,.92)` | – | `rgba(23,42,70,.85)` | – |
| `--nav-line` | `rgba(16,34,63,.09)` | – | `rgba(247,240,231,.1)` | – |
| `--nav-ico` | `#55617a` | 6,2 na liště | `rgba(247,240,231,.68)` | 6,7 na liště |
| aktivní sekce v liště (`.mobile-nav .mi.active`) | pozadí `#10223f`, text `#fff` | 15,9 | pozadí `var(--accent)` (#cc4620), text `#fff` | 4,7; kapsle vůči liště 3,1 |

Poznámky k tabulce:

- `--accent`, `--good`, `--warn`, `--bad` jsou dnes v `:root` společné; v návrhu se liší podle režimu, proto patří do
  `[data-theme=…]`. `--accent` nese v aplikaci bílý text (`.wc-n`, `.tf-n`, `.poi-acts a.go`) – proto je korálová
  tmavší (#c2401f / #cc4620) a světlá korálová #ff8f6b je jen `--accent-ink` pro text v tmavém režimu.
- `--grad` je dnes pod bílým textem (`.trip-top`, `.score-pill`, `.pill.on`, `.ml-n`…), proto přechod „západ slunce
  nad mořem“ končí tmavě modrou. Jasný sluneční přechod (#ffc23d → #f98a4b → #e4572e) zůstává jen ve značce
  a ilustracích – na něj patří tmavě modrý text, nikdy bílý.
- Hlavní tlačítko ve světlém režimu zůstává tmavé (dnes `#0f1830`, nově `#10223f`); v tmavém režimu `var(--accent)`
  s bílým textem.

## Barva pro manifest a lištu prohlížeče

- `public/manifest.webmanifest`: `"theme_color": "#fbf6f0"`, `"background_color": "#fbf6f0"` (hlavní uživatel je ve
  světlém režimu; úvodní obrazovka PWA tak nebliká tmavě).
- `<meta name="theme-color">` v `public/index.html`: světlý `#fbf6f0`, tmavý `#0b1729` – a stejné hodnoty všude, kde
  jsou dnes `#eef2fb` / `#080c1a` napevno: skript v hlavičce `index.html`, pozadí `#launch` a `THEME` v `pwa.js`
  (přepínají lištu podle zvoleného motivu), světlé plochy v `sharecard.js`.

## Co by se při zavedení muselo změnit navíc (mimo tento návrh)

- Ikony a favicon (`scripts/build-icons.mjs`), úvodní animace `#launch` a logo v postranním panelu (`.brand-logo`,
  dnes vlaštovka na modrofialovém přechodu).
- Napevno zapsané modré barvy ve světlém režimu (`#2f5fd0`, `rgba(91,140,255,…)` ve stínech a `.chip.accent`,
  `#0f1830`) – nahradit `var(--accent-ink)` / `var(--text)`, jinak by v teplé paletě zůstaly modré ostrůvky.
- Barevné závoje pozadí v `--bg-grad` (dnes fialová a tyrkysová) – nově třeba
  `radial-gradient(… rgba(249,138,75,.12) …)` a `radial-gradient(… rgba(255,194,61,.10) …)` nad `--bg`.
- Mapové barvy (`--map-*`) a `--info` návrh nemění.
