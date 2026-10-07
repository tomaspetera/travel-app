# Živá kontrola – Safari (Playwright WebKit), opakování po opravě horní lišty

- **Web:** https://atlas-letenky.onrender.com, sestavení `55b2ff4b22bf` (ověřeno v `sw.js`), PR #33
- **Kdy:** 7. 10. 2026
- **Čím:** stejný skript jako v první kontrole (`safari.js`), Playwright WebKit 26.6, profil **iPhone 13**. Nic nového jsem neinstaloval.
- Skript, JSON a všechny snímky jsou na PC v `%TEMP%\atlas-qa\live9\`; snímky z první kontroly jsou v podsložce `safari-run1\`.

## Výsledek

**V1 je opravené.** Na všech třech obrazovkách se po posunutí dolů pod horní lištou nic nekříží s nadpisem ani podtitulem. Lišta má pod textem plné pozadí a obsah mizí až v úzkém přechodu pod podtitulem.

| Obrazovka | Před opravou | Po opravě | Snímek |
|---|---|---|---|
| Cesta → karta Co zařídit, seznam věcí | „Hygienické potřeby“ přes „→ program → shrnutí“ | ✅ nadpis i podtitul čisté, řádek pod lištou je jen z poloviny vidět v přechodu | `safari-iphone-13-pretrip-pack.png` |
| Lety → pohled Mapa | čipy aerolinek přes „Nejlevnější letenky ze všech letišť v okolí“ | ✅ čisté | `safari-iphone-05-results-map.png` |
| Lety → nabídka do Paříže | buňky Nejbližších dnů přes nadpis a čip „Praha“ | ✅ čisté | `safari-iphone-08-paris-offer.png` |
| Země ve světlém režimu (navíc) | – | ✅ čisté i na světlém pozadí | `safari-iphone-light-topbar.png` |

## Počty (celý průchod, iPhone 13)

| | První kontrola | Teď |
|---|---|---|
| `pageerror` | 0 | 0 |
| Chyby v konzoli | 0 | 0 |
| Selhané požadavky na náš web | 0 | 0 |
| Odpovědi 4xx/5xx | 0 | 0 |
| Vodorovné přetečení | 0 | 0 |

Všech 11 kroků průchodu prošlo (Přehled, Lety kamkoli, Mapa výsledků, Paříž na přesná data, Cesta a karta Co zařídit, stránka Mapa, Země, Objevuj, Plánovač, Doporučení). Jediné varování je dál to z MapLibre v kroku Program.

## Poznámky

- V2 (pole s datem jako text) a V3 (tence kreslené tučné písmo) jsou v testovacím WebKitu vidět stejně jako minule; podle dohody se neřeší.
- V úzkém přechodu pod lištou je řádek obsahu vidět napůl oříznutý. Je to záměr přechodu a nic se tam s textem lišty nepřekrývá.
- Profil Safari na počítači jsem znovu nepouštěl (lišta se tam s obsahem nekřížila ani předtím). Světlý režim jsem zkusil jen na stránce Země.
- Skutečné Safari na zařízení jsem neověřil.
