# Letsi – ikony, logo, znak a favicon (vzhled Letsi, krok 3)

Původ: balík identity **Letsi 2.1** (master 2.1 ze 7. 11. 2026, ikony rozhraní z 10. 11. 2026). Identitu vytvořil
majitel aplikace; soubory jsou zkopírované z balíku **beze změny** (žádné překreslení ani přebarvení).

Používá je jen `public/css/letsi.css` (pravidla pod `<html data-brand="letsi">`, přepínač `?vzhled=letsi`) a úvodní
skript v `public/index.html` (favicon). Bez přepínače se odsud nestáhne nic. Do sady pro instalaci (service worker)
nepatří – uloží se pro offline až po prvním stažení, stejně jako písma Letsi.

| soubor | z balíku | kde |
|---|---|---|
| `ikony/*.svg` | `ikony-ui/svg/` | ikony lišt a tlačítek (CSS maska, barva z `currentColor`) |
| `letsi-znak-mono.svg` | `znak/` | záložka Lety (hledání) – znak kukátka 27 px |
| `letsi-logo-mala-mono.svg` | `logo/` | postranní panel na počítači (lišta aplikace = jednobarevné logo) |
| `letsi-logo-hlavni.svg`, `letsi-logo-negativ.svg` | `logo/` | úvodní obrazovka (světlý / tmavý režim) |
| `favicon.svg`, `favicon-32.png` | `ikona/` | favicon |

Kterou ikonu kam: `ikony-ui/ikony.json` v balíku (význam a použití). Přidávej jen soubory, které aplikace opravdu
používá – `test/vzhled-letsi.test.js` hlídá, že každý soubor tady má odkaz.
