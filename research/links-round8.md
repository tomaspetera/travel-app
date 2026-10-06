# Kolo 8 – odkazy na ubytování: co se skutečně předvyplní

Ověřeno 6. 10. 2026 ve skutečném Chromu (playwright-core, čistý profil pro každý test Kayaku), termín **18.–21. 11. 2026, 2 dospělí**. Kód aplikace jsem neměnil. Skripty a surové výsledky: `%TEMP%\atlas-qa\round8-links.js`, `round8-kayak2.js`, `round8\links-*.json`.

## Doporučení v kostce

| Partner | Doporučený formát | Co předvyplní | Potřebuje ID? |
|---|---|---|---|
| **Kayak** | `https://www.kayak.com/hotels/{Město}-{Země anglicky}/{od}/{do}/{N}adults`, mezery → pomlčky | místo, data, hosty | ne (nejspolehlivější je ale `-c{ctid}` z našeptávače) |
| **Agoda** | `https://www.agoda.com/search?city={cityId}&checkIn={od}&checkOut={do}&los={noci}&rooms=1&adults={N}&children=0` | místo, data, hosty | ano – `cityId` z HTML stránky města |
| **Trip.com** | `https://www.trip.com/hotels/list?cityId={id}&checkin={od}&checkout={do}&crn=1&adult={N}&children=0&curr=CZK&locale=cs-CZ` | místo, data, hosty, výsledky hned | ano – veřejný našeptávač |
| **Google Hotels** | `https://www.google.com/travel/search?q=hotels%20in%20{místo}&hl=cs&curr=CZK&ts={ts}` | místo, data, hosty | ne |
| **Hostelworld** | `https://www.hostelworld.com/pwa/s?type=city&id={id}&from={od}&to={do}&guests={N}` | místo, data, hosty | ano – `id` z HTML stránky města |

**Pozor na opravu z 7. kola:** samotný název města u Kayaku pošle **Lagos do Portugalska** a **Porto Novo na Kapverdy**. Je potřeba přidat zemi (viz bod 1).

## 1) Kayak

Formát `https://www.kayak.com/hotels/{název}/2026-11-18/2026-11-21/2adults`. Kayak adresu přesměruje na tvar s ID (`…-c{ctid}`); v titulku stránky je město, region a země. Ve všech úspěšných případech se předvyplnilo „Start date Nov 18", „End date Nov 21", „2 guests".

### Jen název města

| Zadáno | Kam to vedlo | Správně? |
|---|---|---|
| Porto Novo / Porto-Novo | Porto Novo, **Kapverdy** (c87080), 31 nabídek | ❌ (Benin je c4437) |
| Lagos | Lagos, Faro, **Portugalsko** (c4331) | ❌ pro Nigérii (c25271) |
| Valencia | Valencia, Španělsko (c19900) | záleží – Venezuela je c14400 |
| Córdoba | Córdoba, Andalusie, Španělsko (c4940) | záleží – Argentina je c10439 |
| Santiago | Santiago, Chile (c9040) | ✅ pro Chile |
| San José | San Jose, **Kalifornie, USA** (c11228) | ❌ pro Kostariku (c30707) |
| Victoria | Victoria, **Britská Kolumbie, Kanada** (c20996) | ❌ pro Seychely (c45660) |
| Cambridge | Cambridge, **Massachusetts, USA** (c4755) | ❌ pro Anglii (c17146) |
| Kutná Hora | Kutná Hora, Středočeský kraj (c65693), 243 hotelů | ✅ |
| Český Krumlov | Český Krumlov, Jižní Čechy (c42190) | ✅ |
| Mikulov | Mikulov, Jihomoravský kraj (c68001) | ✅ (existuje i Mikulov v Ústeckém kraji, c98975) |
| Kraków | Krakow, Malopolskie, Polsko (c9856) | ✅ |
| Zürich | Zurich, Švýcarsko (c16623) | ✅ |

Diakritika ani pomlčka v názvu nevadí. Víceznačná jména ale Kayak rozhodne podle své oblíbenosti, ne podle země.

### Varianty se zemí

| Varianta | Výsledek |
|---|---|
| **`Město-Země` anglicky, s pomlčkami** | ✅ **14 z 14 správně:** Valencia-Spain, Valencia-Venezuela, Cordoba-Argentina, Córdoba-Argentina, Santiago-Chile, San-Jose-Costa-Rica, San-José-Costa-Rica, Victoria-Seychelles, Cambridge-United-Kingdom, Porto-Novo-Benin, Cotonou-Benin, Abeokuta-Nigeria, Lagos-Nigeria, Kutna-Hora-Czech-Republic |
| `Město Země` s mezerami (`Porto Novo Benin`) | ✅ Benin (1 test) |
| `Město-Země` česky (`Kutná-Hora-Česko`, `Valencia-Španělsko`) | vedlo na správné místo, ale obě jména jsou jednoznačná nebo výchozí – neprokazuje to, že Kayak české jméno země chápe |
| `Město-ISO` s pomlčkou | ⚠️ nespolehlivé: Porto-Novo-BJ ✅, Valencia-VE ✅, **Cambridge-GB → „Page not found (400)"** |
| `Město,Země` s čárkou bez mezery | ❌ 6 z 6 skončilo na úvodní `/stays` bez předvyplnění |
| `Město, ISO` s čárkou a mezerou | ❌ nespolehlivé: 3 ze 6 skončily na `/stays`; zbylé 3 (Santiago, CL; San José, CR; Victoria, SC) vedly do správné země, ale na okolí **letiště** (`…-c9040-lSCL`) |
| `Město,ISO` bez mezery | ❌ Valencia,VE → `/stays`; Santiago,CL → letiště |

### Našeptávač (nejjistější cesta)

`GET https://www.kayak.com/mvm/smartyv2/search?f=j&s=50&where={dotaz}&lc=en&lc_cc=US&v=v1` – funguje bez cookies i obyčejným požadavkem (HTTP 200). Vrací pole objektů `{ id, displayname, loctype: "city", cc, ctid, lat, lng, … }`. Příklad pro „Porto Novo": `Porto Novo, Cape Verde [CV] ctid=87080`, `Porto Novo, Benin [BJ] ctid=4437`. Stačí vybrat položku se správným `cc` a použít `…/hotels/{cokoli}-c{ctid}/{od}/{do}/{N}adults`.

**Doporučení:** posílat `{Město}-{Země anglicky}` s pomlčkami místo mezer (např. `Porto-Novo-Benin`). Kde to jde, na serveru přes našeptávač dohledat `ctid` podle kódu země a použít `-c{ctid}`. Nepoužívat samotný název, čárku ani ISO kód.

## 2) Agoda

### Stránka města `https://www.agoda.com/city/{slug}-{cc}.html`

| Slug | Výsledek | `cityId` |
|---|---|---|
| cotonou-bj | ✅ „Cotonou – hotely a ubytování" | 20636 |
| prague-cz | ✅ „Praha – hotely a ubytování" | 15977 |
| kutna-hora-cz | ✅ | 67491 |
| abeokuta-ng | ✅ | 166137 |
| bangkok-th | ✅ | 9395 |
| chiang-mai-th | ✅ | 7401 |
| porto-novo-bj | ❌ HTTP 404 → `/pagenotfound.html` („Omlouváme se!") | – |
| praha-cz (české jméno) | ❌ HTTP 404 | – |
| neexistujici-mesto-cz | ❌ HTTP 404 | – |

- Stránka města předvyplní **jen město**. Slug je anglický název malými písmeny s pomlčkami + kód země.
- **Data a hosty do stránky města přidat nejde.** Zkoušel jsem `?checkIn=…&los=3&adults=2&rooms=1&children=0`, `?checkIn=…&checkOut=…` i malými písmeny – po kliknutí na „HLEDAT" Agoda vždy vytvořila adresu s výchozím termínem: `…/search?city=20636&checkIn=2026-10-15&los=1&rooms=1&adults=2&children=0&locale=cs-cz&ckuid=…&prid=0&currency=CZK&correlationId=…`.
- Z té adresy je vidět formát, který Agoda sama používá: **`/search?city={cityId}&checkIn={datum}&los={počet nocí}&rooms=1&adults={N}&children=0`**.

### Hledání s `cityId`

`https://www.agoda.com/search?city={cityId}&checkIn=2026-11-18&checkOut=2026-11-21&los=3&rooms=1&adults=2&children=0` → „18. lis 2026 středa – 21. lis 2026 sobota", „Dospělých: 2 Pokoj: 1":

- Cotonou (20636): 298 ubytování
- Praha (15977): 2 439
- Kutná Hora (67491): 77

### Jak zjistit `cityId`

HTML stránky města jde stáhnout obyčejným požadavkem (HTTP 200, bez prohlížeče). Pole `"cityId"` je v něm nulové, ale ID je na dvou jiných místech: `"defaultSearchURL":"/search?city=67491&checkIn=…"` a `"objectId":67491` (u `"pageTypeId":5`).

**Doporučení:** na serveru stáhnout `agoda.com/city/{slug}-{cc}.html`, vytáhnout `city=(\d+)` z `defaultSearchURL` a poslat uživatele na `/search?city=…` s daty. Když stránka města vrátí 404 (malá města jako Porto-Novo, nebo jiný slug), nechat dnešní odkaz na úvodní stránku s popiskem „zadej místo a data".

## 3) Trip.com

- **Výsledky hned:** `https://www.trip.com/hotels/list?cityId=3251&checkin=2026-11-18&checkout=2026-11-21&crn=1&adult=2&children=0&curr=CZK&locale=cs-CZ` → „Cotonou", „Wed, Nov 18 – Sat, Nov 21", „1 room, 2 adults, 0 children", **132 ubytování** bez potvrzování. Funguje i bez `curr` a `locale` a se starším názvem `city=3251`.
- **`searchWord=Cotonou, Benin` spolehlivé není:** v čistém profilu (7. kolo) vyplnil pole, ale ukázal 0 výsledků, dokud uživatel nepotvrdil hledání. V tomhle běhu ukázal 132 – ale až po předchozí návštěvě adresy s `cityId` ve stejném profilu, takže to nepočítám.
- **Jak zjistit `cityId` bez klíče:** web volá veřejný našeptávač

  `POST https://www.trip.com/restapi/soa2/34951/getHotelKeywords`, `content-type: application/json`, tělo:

  ```json
  {"queryInfo":{"keyword":"Cotonou","actionType":"destination"},"head":{"platform":"PC","bu":"IBU","group":"trip","locale":"en-XX","currency":"USD"}}
  ```

  Odpověď: `data.mainKeywordList.keywords[]`, v každé položce `keyword.keywordContentInfo` s poli `keywordId` (= `cityId`), `keyword` (název), `tripType` (`"CT"` = město, `"N"` = okolí, `"H"` = hotel), `displayTexts` (klíč `SUB_TITLE` = region a země) a `coordinateItemList` (typ `NORMAL` = zeměpisná šířka a délka).

  Ověřeno obyčejným požadavkem z Node bez cookies (HTTP 200): Cotonou → 3251 (Littoral, Benin), Kutna Hora → 38742, Brno → 3455, Valencia → 1351 (Španělsko). S hlavičkou `head` obsahující jen `locale` vrací HTTP 500 – pole `platform`, `bu`, `group`, `locale` a `currency` jsou potřeba. Dotaz s `locale: "cs-CZ"` a diakritikou („Kutná Hora") jsem zkoušel jen s neúplnou hlavičkou (500), takže doporučuji `en-XX` a název bez diakritiky.

**Doporučení:** na serveru zavolat našeptávač, vzít první položku s `tripType: "CT"` (u víceznačných jmen tu, která je nejblíž souřadnicím místa) a odkazovat přes `cityId`. Když našeptávač nic nevrátí, nechat dnešní `searchWord` s popiskem „potvrď Hledat".

## 4) Google Hotels – parametr `ts`

`https://www.google.com/travel/search?q=hotels%20in%20{místo}&hl=cs&curr=CZK&ts={ts}`

| Místo | Termín, hosté | Na stránce |
|---|---|---|
| Praha | 18.–21. 11. 2026, 2 | Příjezd „st 18. 11.", Odjezd „so 21. 11.", „počet hostů: 2" ✅ |
| Cotonou, Benin | 18.–21. 11. 2026, 2 | st 18. 11. – so 21. 11., 2 hosté ✅ |
| Kutná Hora | 18.–21. 11. 2026, 2 | st 18. 11. – so 21. 11., 2 hosté ✅ |
| Praha | 27. 12. 2026 – 10. 1. 2027, 4 | ne 27. 12. – ne 10. 1., 4 hosté ✅ (přes konec roku, 14 nocí) |
| Cotonou, Benin | 22.–23. 11. 2026, 1 | ne 22. 11. – po 23. 11., 1 host ✅ |

### Přesný algoritmus

`ts` je zpráva ve formátu protobuf zakódovaná jako base64url bez výplně (`+` → `-`, `/` → `_`, bez `=`). Bajty:

```
08 01                                  pole 1 = 1
12 LL  { 0A 02 08 03 } × počet dospělých,  10 00        pole 2 = hosté (jeden blok na dospělého)
1A LL  0A 02 1A 00                                        pole 3: prázdné místo
       12 LL  12 LL { 0A 07 <příjezd>  12 07 <odjezd> }   data
              18 <počet nocí>
              32 02 10 00
2A LL  0A LL  3A 03 "CZK"  1A 00                          pole 5 = měna
```

- `<datum>` = `08 <rok jako varint>` `10 <měsíc>` `18 <den>`; rok 2026 = `EA 0F`, 2027 = `EB 0F` (varint: `(rok & 0x7F) | 0x80`, `rok >> 7`). Blok data má vždy 7 bajtů.
- `LL` je délka následujícího bloku v jednom bajtu.

```js
const gDate = iso => { const [y, m, d] = iso.split('-').map(Number); return [0x08, (y & 0x7f) | 0x80, y >> 7, 0x10, m, 0x18, d]; };
function googleHotelsTs(checkin, checkout, adults, currency = 'CZK') {
  const guests = [...Array.from({ length: adults }, () => [0x0a, 0x02, 0x08, 0x03]).flat(), 0x10, 0x00];
  const d1 = gDate(checkin), d2 = gDate(checkout);
  const dates = [0x0a, d1.length, ...d1, 0x12, d2.length, ...d2];
  const nights = Math.round((new Date(checkout) - new Date(checkin)) / 864e5);
  const stay = [0x12, dates.length, ...dates, 0x18, nights, 0x32, 0x02, 0x10, 0x00];
  const f3 = [0x0a, 0x02, 0x1a, 0x00, 0x12, stay.length, ...stay];
  const cur = [...Buffer.from(currency)];
  const f5 = [0x0a, cur.length + 2, 0x3a, cur.length, ...cur, 0x1a, 0x00];
  return Buffer.from([0x08, 0x01, 0x12, guests.length, ...guests, 0x1a, f3.length, ...f3, 0x2a, f5.length, ...f5])
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
// googleHotelsTs('2026-11-22', '2026-11-23', 1) === 'CAESBgoCCAMQABogCgIaABIaEhIKBwjqDxALGBYSBwjqDxALGBcYATICEAAqCQoFOgNDWksaAA'
```

**Meze:** délky jsou jednobajtové, takže to platí do 127 nocí a zhruba do 30 dospělých. Děti jsem nezkoušel. Je to odpozorovaný formát, ne dokumentované rozhraní – při změně na straně Googlu se odkaz zachová (město v `q` funguje dál), jen přestanou sedět data.

**Doporučení:** přidat `ts` k dnešnímu odkazu a popisek „zadej data" změnit na běžný.

## 5) Hostelworld

- **Stránka města** `https://www.hostelworld.com/hostels/{kontinent}/{země}/{město}/` existuje i pro malá místa (Cotonou, Prague, Kutna Hora, Mikulov – všechny HTTP 200). **Parametry `?from=…&to=…&guests=…` ignoruje** – zůstane výchozí termín (7.–10. 10.) a 2 hosté.
- **Adresa, kterou web vytvoří po hledání:** `https://www.hostelworld.com/pwa/s?q=Cotonou,%20Benin&country=Benin&city=Cotonou&type=city&id=5504&from=2026-10-07&to=2026-10-10&guests=2&page=1`.
- **Stačí zkrácený tvar jen s ID:** `https://www.hostelworld.com/pwa/s?type=city&id={id}&from=2026-11-18&to=2026-11-21&guests=2` → město se doplní samo, „18 Nov - 21 Nov", „Guests 2":

| Město | `id` | Výsledků |
|---|---|---|
| Cotonou, Benin | 5504 | 52 |
| Prague, Czech Republic | 19 | 55 |
| Kutna Hora, Czech Republic | 10508 | 41 |
| Mikulov | stránka existuje, ale odkaz s ID na ní není | – |

- Bez `id` vrací `/pwa/s` 404 (ověřeno v route7).
- **Jak zjistit `id`:** HTML stránky města jde stáhnout obyčejným požadavkem (HTTP 200) a obsahuje odkaz `…/pwa/s?q=Kutna+Hora%2C+Czech+Republic&country=Czech+Republic&city=Kutna+Hora&type=city&id=10508…`.

**Doporučení:** na serveru stáhnout stránku města, vytáhnout `id=(\d+)` z odkazu na `/pwa/s` a posílat `pwa/s?type=city&id=…&from=…&to=…&guests=…`. Kde odkaz s ID chybí (Mikulov), nechat stránku města s popiskem „zadej data".

## Co jsem neověřoval

- Počty dětí a víc pokojů u žádného partnera.
- Chování na mobilních verzích webů partnerů.
- U Kayaku české názvy zemí u skutečně víceznačných měst a hodnotu parametru `lc_cc` jinou než `US`.
- Stabilitu neveřejných rozhraní (našeptávače Kayaku a Trip.com, `ts` u Googlu) v čase – všechno je stav k 6. 10. 2026.
