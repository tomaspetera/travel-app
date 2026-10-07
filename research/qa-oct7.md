# Kontrola změn ATLASu ze 7. 10. 2026 na živém webu (vlastní skript)

- **Web:** https://atlas-letenky.onrender.com, sestavení `a071ee74e633` (přečteno ze `sw.js`)
- **Kdy:** 7. 10. 2026
- **Čím:** vlastní skript (ne ten z cloudu – jeho uložení na PC zablokoval ochranný režim; Peter pak zadal ověřit totéž vlastním skriptem). Skutečný Chrome a Playwright WebKit 26.6, čisté profily, cs-CZ. Nic jsem neinstaloval.
- **Výstupy:** `qa-oct7/vysledky.json`, `qa-oct7/vypis.txt` (celý výpis konzole), snímky `qa-oct7/logo-*.png` a `qa-oct7/phone-*.png`. Skript je na PC v `%TEMP%\atlas-qa\live9\oct7.js`.
- Testovací cestu jsem nesestavoval z dodaných odkazů, ale přímo v aplikaci: Praha → Barcelona, trasa po víc místech (Barcelona 6 nocí, Besalú 1, Lloret de Mar 1).

## Shrnutí

**38 ze 40 kontrol v pořádku.** Obě selhání jsou úvodní obrazovky na šířku a podle všeho jde o vlastnost emulace, ne o chybu webu (vysvětlení níže). Žádná chyba stránky v Chromu ani ve WebKitu.

**Jednu věc tento test neumí rozhodnout:** jestli zápis do schránky projde ve skutečném Safari. Testovací WebKit pravidlo „jen při kliknutí“ nevynucuje – i zápis 300 ms po kliknutí v něm prošel. Ověřil jsem proto to, co ověřit jde: že aplikace schránku volá přímo v obsluze kliknutí (0–2 ms od události), což je podmínka, kterou Safari vyžaduje.

## Výsledky

| Kontrola | Chrome | WebKit | Poznámka |
|---|---|---|---|
| Sdílení cesty: odkaz zapsán do schránky | ✅ | ✅ | `clipboard.write`, výsledek ok, hláška „Odkaz zkopírován – pošli ho komukoliv“. |
| Zápis je přímo v obsluze kliknutí | ✅ 1 ms | ✅ 2 ms | Viz omezení výše. |
| Odkaz na cestu je krátký | ✅ 2 488 znaků | ✅ 2 506 znaků | Část za `#trip=` začíná „z“. Ve stejném scénáři měl odkaz ráno 82 097 znaků. |
| Ve schránce je opravdu ten odkaz (čtení zpět) | ✅ | – | Ve WebKitu schránku zpět přečíst nejde; text jsem vzal z předaného objektu. |
| Odkaz na cestu v čistém prohlížeči = stejná cesta | ✅ | ✅ | Cíl, let, 3 místa i počty nocí shodné. |
| Shrnutí cesty je po otevření stejné | ✅ 5 247 znaků | ✅ 5 245 znaků | Porovnáno po dočtení podnebí. |
| Odkaz na cestu přenese odškrtnuté úkoly | ✅ | ✅ | Odesláno `todo:ins`, `pack:doc-op`; přijato totéž. Ráno se nepřenášely. |
| Sdílení plánu: odkaz zapsán do schránky | ✅ 0 ms | ✅ 1 ms | `clipboard.writeText`, hláška „Odkaz na plán zkopírován – pošli ho komukoliv“. |
| Odkaz na plán je krátký | ✅ 1 725 znaků | ✅ 1 732 znaků | Část za `#plan=` začíná „z“. Ráno 3 884 znaků. |
| Odkaz na plán: náhled a import v čistém prohlížeči | ✅ | ✅ | „Barcelona 5.12.“, 5.–13. 12., 24 položek. |
| Odkaz na plán přenese odškrtnuté položky | ✅ | ✅ | Odesláno 3 (pozice 0, 2, 5), přijato 3 tytéž. Ráno se nepřenášely. |
| 📲 Hlídat i v mobilu: okno s kódem | ✅ | ✅ | Okno „Hlídání i se zavřeným ATLASem“, 1 hledání, kód 388 znaků začínající „z“. |
| 📲 kód je i ve schránce | ✅ 1 ms | ✅ 1 ms | Shodný s kódem v okně, hláška „Kód pro hlídání v mobilu zkopírován“. |
| Logo v bočním panelu | ✅ | ✅ | Vlaštovka ze dvou trojúhelníků na zaobleném čtverci s přechodem, v tmavém i světlém režimu. |
| Bez chyb stránky při celém průchodu | ✅ | ✅ | Včetně otevření obou odkazů v čistém prohlížeči. |

### Úvodní obrazovky pro iPhone a iPad (WebKit)

Stránka má 31 odkazů `apple-touch-startup-image` (22 na výšku, 9 na šířku). Značky pro plochu: `apple-mobile-web-app-capable=yes`, název „ATLAS“, ikona `icons/apple-touch-icon.png`.

| Zařízení | Displej | Vybraný obrázek | Výsledek |
|---|---|---|---|
| iPhone 13 | 390×844 @3 | `icons/splash/1170x2532.png` (1170×2532) | ✅ |
| iPhone 15 Pro Max | 430×932 @3 | `icons/splash/1290x2796.png` (1290×2796) | ✅ |
| iPhone SE | 320×568 @2 | `icons/splash/640x1136.png` (640×1136) | ✅ |
| iPad Pro 11 | 834×1194 @2 | `icons/splash/1668x2388.png` (1668×2388) | ✅ |
| iPad Mini | 768×1024 @2 | `icons/splash/1536x2048.png` (1536×2048) | ✅ |
| iPhone 13 na šířku | 844×390 @3 | žádný | ❌ – viz níže |
| iPad Pro 11 na šířku | 1194×834 @2 | žádný | ❌ – viz níže |

Každému zařízení na výšku odpovídá právě jeden obrázek, načte se a má přesně rozlišení displeje. Roh i střed obrázku mají barvu `#080c1a`, tedy stejné pozadí jako úvodní obrazovka aplikace.

**Proč selhaly obrazovky na šířku:**
- **iPad Pro 11 na šířku:** pravidlo ve stránce je `(device-width: 834px) and (device-height: 1194px) and (orientation: landscape) → icons/splash/2388x1668.png`. To je tvar, jaký používá skutečný iPad, který i na šířku hlásí šířku zařízení 834. Emulace Playwrightu ale rozměry prohodí a hlásí 1194×834, takže pravidlo nenajde. Považuji to za vlastnost testu; na skutečném iPadu jsem to neověřil.
- **iPhone na šířku:** stránka pro iPhony pravidla na šířku nemá vůbec. Jestli je to záměr, nevím – stojí za potvrzení.

## Co jsem neověřil

- Zápis do schránky ve skutečném Safari (viz omezení nahoře).
- Zobrazení úvodní obrazovky po přidání na plochu skutečného iPhonu nebo iPadu – kontroloval jsem jen, že se pro daný displej vybere správný obrázek.
- Jestli GitHub s kódem z tlačítka 📲 opravdu hlídá a posílá upozornění; ověřil jsem jen okno, kód a schránku.
- Edge a mobilní šířku 390 px v tomto kole.
