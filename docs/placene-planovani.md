# Placené plánování celé dovolené – návrh

Stav k 4. 11. 2026. Jen návrh (podle CLAUDE.md se nové velké funkce nejdřív navrhují), nic z toho zatím není v kódu.
Navazuje na navedení k průvodci cestou (PR #366) a na tlačítko 💛 Podpořit ATLAS (SUPPORT_URL).

## Proč právě průvodce cestou
Vyhledávače letenek (Kiwi, Google Flights, Skyscanner) najdou let. ATLAS k letu poskládá **celou dovolenou**: trasu přes
jedno nebo víc míst s přejezdy a rozdělením nocí, ubytování v každém místě, auto, program po dnech a cenu celkem.
To je to, za co může mít smysl platit – lety a radar zůstanou zdarma.

## Co zdarma a co placené (verze 1)
| Zdarma | Placené („Odemknout cestu“) |
| --- | --- |
| Lety, radar, hlídání cen, Objevuj | **⚡ Poskládej celou cestu za mě** (hotová cesta jedním klepnutím) |
| Ruční cesta na **jedno místo**: let → trasa (jedno místo) → ubytování → auto → program → shrnutí | **Trasa přes víc míst** s přejezdy a rozdělením nocí |
| Sdílení plánu, kalendář, Moje cesty, program dne offline (Na cestě) | (později) itinerář k tisku |

Proč ne zamknout celého průvodce: v kroku Ubytování lidé klikají na Booking.com – to je hlavní zdroj provizí
(Travelpayouts). Zamčený průvodce = méně dokončených cest = méně provizí.

Před odemknutím má být vidět, co člověk dostane: trasa na mapě, města, počet nocí a cena celkem odhadem.
Konkrétní hotely v každém místě a program po dnech až po zaplacení.

## Cena a model
- **Za cestu, ne předplatné** – lidé plánují 1–3 dovolené ročně, měsíční poplatek by odrazoval. Jednorázová platba
  navíc nepotřebuje rušení předplatného ani zákaznický portál.
- Hypotéza **99 Kč za cestu** (případně 249 Kč na rok bez omezení) – ověřit ve zkušebním provozu otázkou
  „Zaplatil bys za hotovou cestu? Kolik?“.

## Jak platba funguje bez účtu
ATLAS nemá účty a server o lidech nic neukládá – placení to nemá změnit.
1. Klepnutí na **Odemknout cestu** → server vytvoří Stripe Checkout Session (cena z proměnné prostředí) a vrátí adresu
   platební stránky Stripe.
2. Po zaplacení Stripe vrátí člověka do aplikace s `session_id`. Aplikace ho pošle na `POST /api/unlock`.
3. Server se zeptá Stripe API, jestli je session zaplacená (klíč `STRIPE_SECRET_KEY` jen v proměnné prostředí), a vrátí
   **podepsaný token** (HMAC klíčem `UNLOCK_SECRET`) s platností. Nic neukládá – token ověří podpisem.
4. Token je u cesty v prohlížeči (localStorage), přenese se zálohou i 📲 přenosem.
5. Stejný `session_id` dá vždy stejný token (opakované otevření návratové adresy nic nepokazí).

**Vazba na jednu cestu je jen v aplikaci.** Id cesty (`created`) si dává aplikace sama a volání průvodce (`api/stayplan`)
id cesty nenesou – server nepozná, ke které cestě token patří. Kdo aplikaci obejde, odemkne si jednou platbou víc cest.
Při ceně kolem 99 Kč je to přijatelné; přísněji jen s účty, které ATLAS mít nechce.

Webhook ani databáze nejsou potřeba. Vrácení peněz řeší provozovatel ve Stripe (token pak sám nezneplatní – při ceně
99 Kč to nevadí).

## Co server hlídá
- **Trasa přes víc míst po zemi**: `POST /api/stayplan` jen s platným tokenem, a to obojí – **návrh trasy** (bez `bases`,
  trip.js `suggestRoute`; vrací víc míst) i přepočet trasy s víc místy (`bases.length > 1`). Bez tokenu odpověď
  „odemkni cestu“. Jedno místo dál zdarma.
- **Cesta přes víc měst letadlem** (Lety → Víc měst): trasu dávají lety, server ji nepočítá (trip.js `isFly` – návrh
  trasy se pro ni nevolá) – ve verzi 1 ji hlídá jen aplikace.
- **⚡ Poskládej celou cestu**: skládá ji aplikace z volání, která jsou zdarma i pro ruční cestu (ubytování, program) –
  ve verzi 1 ji hlídá jen aplikace. Kdo ji obejde přes vývojářské nástroje, dostane jen to, co by si naklikal ručně.
  Plné hlídání by chtělo skládání na serveru (`/api/compose`) – až podle zájmu.
- `api/itinerary` (program) zůstává zdarma – používá ho i Objevuj.

## Co je potřeba od provozovatele
- Stripe účet (OSVČ jde), produkt „Odemknutí cesty“ s cenou; na Renderu `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`,
  `UNLOCK_SECRET` (náhodný řetězec).
- **Obchodní podmínky** a poučení o odstoupení (u digitálního obsahu lze 14denní lhůtu se souhlasem kupujícího vyloučit),
  provozovatel v ℹ️ O aplikaci (`OPERATOR`, už připravené).
- **Účetní**: živnost, DPH u digitálních služeb, doklady o platbě (Stripe umí potvrzení e-mailem).
- **Právník**: prodej výsledku z neoficiálních zdrojů cen (Ryanair, Wizz Air, Xotelo) je větší riziko než jen odkazy –
  vyjasnit před spuštěním placení. Lidé, kteří zaplatí, taky čekají přesné ceny – u odemknutí jasně „ceny orientační,
  rezervuješ u partnerů“.

## Rozdělení práce (až po zkušebním provozu)
1. Server: `/api/checkout`, `/api/unlock`, ověření tokenu v `/api/stayplan` (víc míst) + testy – malá změna, bez
   závislostí (Stripe API přes `fetch`).
2. Aplikace: náhled zamčené cesty (trasa, noci, cena celkem), tlačítko Odemknout, návrat ze Stripe, token u cesty
   (záloha, přenos).
3. ℹ️ O aplikaci: platby a soukromí (co vidí Stripe), obchodní podmínky.

## Co sledovat
Analytika v aplikaci není (a nemá být – slib v O aplikaci). Stačí: počet plateb ve Stripe, provize v Travelpayouts
a zpětná vazba ze zkušebního provozu. Kdyby odemknutí kupoval jen málokdo, zůstane průvodce celý zdarma a příjem
dál z provizí a dobrovolných příspěvků.
