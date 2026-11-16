# ATLAS – pravidla pro Clauda

ATLAS je česká PWA na levné letenky a plánování cest (živě https://atlas-letenky.onrender.com, nasazení na Render
po sloučení do `main`). Hlavní uživatel ji používá na telefonu (~412 px, světlý režim), web na počítači je druhý.

## Kód
- Node 22, **žádné závislosti** (žádný `npm install` balíčků, žádný build). Server `server/` (index.js, lib/, providers/),
  front-end `public/` (vanilla JS moduly v IIFE, CSS), data `data/`, testy `test/` (`node --test`).
- **Mapa kódu: `docs/mapa.md`** (kde co je: soubory, funkce, endpointy, data, testy). Čti ji dřív, než začneš hledat –
  jen osnovu a potřebný oddíl. Nový soubor nebo endpoint do ní dopiš (hlídá `test/mapa.test.js`).
- `npm test` musí projít. K opravě logiky přidej test. Demo bez sítě: `npm run demo` (vymyšlená data).
- Texty v aplikaci, komentáře v kódu, commity a popisy PR **česky**, ve stylu okolního kódu (komentáře vysvětlují proč).
- Desktop CSS jen v `public/css/desktop*.css` uvnitř `@media (min-width:1024px…)`; telefon se tím nesmí změnit.
- Novinku viditelnou pro uživatele přidej do `WHATS_NEW` v `public/js/app.js` a zvyš `WN_ID` – jen u nových funkcí.

## Pravidla
- **Nic placeného**: žádné placené API ani služby. Klíče jen v proměnných prostředí na Renderu, nikdy v kódu.
- **FlixBus**: ceny nikdy nenačítat automaticky a jejich stránky neotevírat – jen odkazy pro uživatele.
- Na produkci nevolat `/api/search` (drahé hledání u aerolinek); ke kontrole stačí `/api/health` a `/api/places`.
- Žádná upozornění na telefon, žádné „keep-alive“ dotazy, nic, co vyžaduje údržbu navíc.
- Malé, ověřené změny. Velké přestavby nebo nové funkce jen navrhni v popisu PR.

## Bezpečnost a právo
- API klíče (lety, platby, AI) jen na serveru – nikdy ve front-endu (`public/`) ani v gitu. Hledání letů musí mít limit
  z jedné adresy a mezipaměť (`rateLimited()` a `searchKeys()` v `server/index.js`).
- Cena letenky je od prvního zobrazení konečná včetně všech nevyhnutelných poplatků a daní (nařízení EU 1008/2008,
  čl. 23); volitelné příplatky (zavazadla) zvlášť a srozumitelně.
- Údaje cestujících ukládat jen nutné, šifrovaně a s dobou smazání.
- ČR: písma z vlastního serveru (ne Google Fonts), analytika až po souhlasu, platební tlačítko „Objednávka zavazující
  k platbě“, e-maily s odkazem na odhlášení.
- Design bez typického „AI“ vzhledu (generické přechody, ikony a fráze); vzor je identita Letsi 2.1.
