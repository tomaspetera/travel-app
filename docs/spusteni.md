# Spuštění Letsi – den D 12. 1. 2027

Kontrolní seznam pro majitele: co se ke dni D přepne, kde na Renderu a jak to ověřit. Tajné hodnoty sem nepatří –
jen názvy proměnných. Kontrola produkce jen přes `/api/health`, `/healthz`, `/api/places` a stránky webu, **nikdy
`/api/search` ani `/api/diag`** (ostré dotazy na aerolinky).

## Co je „čistý režim“

Veřejná verze bere jen zdroje, jejichž podmínky komerční provoz dovolují:

| Oblast | Testovací provoz (dnes) | Čistý režim (od D) |
|---|---|---|
| Ceny letů | Ryanair a Wizz Air živě, Kiwi.com, Aviasales | jen orientační ceny z mezipaměti Aviasales (Travelpayouts, ~48 h) |
| Nákup letenky | u aerolinky, Kiwi.com nebo na Aviasales | odkaz na Aviasales (partnerský, se štítkem „reklama“) |
| Ověření ceny živě | tlačítko „⚡ Ověřit cenu živě“ (Kiwi.com) | není – tlačítko se samo schová |
| Ubytování | orientační ceny z TripAdvisoru (Xotelo) | bez cen: odkazy na Booking.com, Airbnb… a ubytování z OpenStreetMap |
| Vlak a bus | živé spoje RegioJetu (`REGIOJET_LIVE`) | podle rozhodnutí majitele – jen odhad a odkazy, nebo živě |

Žádný přepínač „režim“ v kódu není – čistý režim je **kombinace proměnných prostředí** (`server/config.js`). Aplikace
ho pozná sama z `/api/health` (`providers[].enabled`): když je ze zdrojů letů zapnutý jen `travelpayouts`, texty přepne
na „orientační ceny z Aviasales, k nákupu tě pošlu tam“ (`public/js/about.js` `buyLine()`, `public/js/flights.js`
`liveOn()`, `liveFoot()`, `radarEmptyTxt()`, `public/js/trip.js` `liveOn()`, `stayPricesOn()`). DEMO (`npm run demo`)
proměnné čistého režimu ignoruje – pořád ukazuje vymyšlené zdroje Demo Air a Demo Jet.

## Render → služba → Environment

Na Renderu: **Dashboard → služba (atlas-letenky) → Environment → Edit**, změnit, pak **Save, rebuild, and deploy**.
Restart smaže mezipaměť v RAM (první hledání a Objevuj pak chvíli čekají) – přepnout ráno, ne ve špičce.

### Přepnout na čistý režim (den D)

| Proměnná | Hodnota | Proč |
|---|---|---|
| `RYANAIR_ENABLED` | `0` | vypne neveřejné API Ryanairu |
| `WIZZ_ENABLED` | `0` | vypne neveřejné API Wizz Air |
| `KIWI_ENABLED` | `0` | vypne Kiwi.com (hledání i „Ověřit cenu živě“) |
| `XOTELO` | `off` | vypne ceny hotelů z TripAdvisoru přes Xotelo |
| `LITEAPI_KEY` | smazat (nebo nechat `sand_…`) | testovací klíč `sand_…` nic neukazuje; ostrý klíč by zapnul ceny hotelů, které v čistém režimu nemají být |
| `REGIOJET_LIVE` | rozhodnout: `0`, nebo nechat | živé spoje RegioJetu z neveřejného rozhraní; README radí před ostrým provozem napsat RegioJetu. Proměnné letů ani hotelů ho nevypnou. Stav ukazuje `/api/health` (`regiojet`) a O aplikaci (živě, nebo „jen jako odkazy“) |

### Musí být nastavené (už dnes zkontrolovat)

| Proměnná | Stav 27. 11. 2026 (`/api/health`) | K čemu |
|---|---|---|
| `TRAVELPAYOUTS_TOKEN` | nastaveno (`travelpayouts` zapnutý) | v čistém režimu **jediný zdroj letů** – bez něj aplikace nemá žádné ceny |
| `TRAVELPAYOUTS_MARKER`, `TRAVELPAYOUTS_TRS` | **`affiliate: false`** – aspoň jedno chybí nebo není číslo | partnerské odkazy na Aviasales (provize) a štítek „reklama“; obě jen číslice (`server/lib/links.js` `affiliateOn()`) |
| `TRAVELPAYOUTS_MARKET` | výchozí `cz` | trh Aviasales, z něhož jsou ceny |
| `FEEDBACK_EMAIL` | nastaveno | 💬 Napsat nám, kontakt v zásadách a na `/soukromi` |
| `OPERATOR` | nastaveno | správce údajů v O aplikaci a na `/soukromi`, `/podminky` |
| `STATS_KEY` | z `/api/health` nejde poznat | bez něj jsou souhrnné počty veřejné; ověřit: `statistiky.html` se musí zeptat na klíč |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | nastaveno (`shortLinks: "upstash"`) | krátké odkazy, počty, záznamy návštěv |
| `PUBLIC_URL` | `https://letsi.cz` (`render.yaml`) | kanonická adresa, náhled odkazu, `sitemap.xml` |
| `SUPPORT_URL` | nenastaveno | volitelné (💛 Podpořit); bez něj tlačítko chybí |
| `PORT` | nenastavovat | dodá Render |

Limity a fronta hledání (`SEARCH_RATE_LIMIT`, `SEARCH_CONCURRENCY`, `SEARCH_QUEUE`, `CACHE_SOFT_MB`) nechat výchozí:
v čistém režimu jde hledání jen na Aviasales (4 dotazy naráz, mezipaměť 1 h – `server/providers/travelpayouts.js`), je
lehčí než dnes. Render zdarma po 15 min bez návštěvy usne (první načtení ~1 min) – placený plán jen podle
`docs/skalovani.md`, ne preventivně.

## Před dnem D

- [ ] **Právní texty** (`docs/pravni/*.md`): doplnit všechna `[doplnit …]` (region Upstash, doba logů Renderu,
      doby uchovávání, předání do USA, autorská práva) a `Účinné od: [datum]` – na webu je dnes víckrát „doplníme“.
      Výčet zdrojů (podmínky odd. 2, 4 a 5, zásady 5.1–5.3) už platí pro čistý režim (Ryanair, Wizz Air, Kiwi.com
      a Xotelo jen „pokud jsou zapnuté“). Pak advokát (oddíly Otázky pro advokáta v obou dokumentech).
- [x] **Testovací verze**: značka „Testovací verze“ v okně Další a v postranním panelu a nadpis „Testovací verze –
      krátká otázka“ (`public/js/otazky.js`) zůstávají i po D, dokud majitel neřekne jinak (rozhodnutí 28. 11. 2026).
      Pak je odebrat v kódu (PR) i se zmínkami v O aplikaci a v zásadách (`atlas_ask`).
- [ ] Novinka „Řekni mi, co ti vadí“ („Letsi je zatím testovací verze…“) ve `WHATS_NEW` zmizí sama po 14 dnech
      (`WN_DAYS`) – nic nedělat. K D případně nová novinka s vyšším `WN_ID` jen u skutečně nové funkce.
- [ ] Partnerské odkazy: doplnit `TRAVELPAYOUTS_MARKER` a `TRAVELPAYOUTS_TRS` (app.travelpayouts.com → Profile →
      Sources), ověřit `affiliate: true` (níž).
- [ ] Rozhodnout RegioJet (`REGIOJET_LIVE`).
- [ ] Zkouška nanečisto (volitelně): na dva dny přepnout čistý režim, projít telefonem Přehled, Lety, průvodce
      cestou a O aplikaci, pak vrátit (Návrat zpět).

## Den D

1. Render → Environment: proměnné z tabulky „Přepnout na čistý režim“ → Save, rebuild, and deploy.
2. Po nasazení (zelené v Events) ověřit:

```bash
curl -s https://letsi.cz/api/health | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const h=JSON.parse(s);
console.log("demo", h.demo, "| affiliate", h.affiliate, "| shortLinks", h.shortLinks,
  "| feedback", !!h.feedback, "| operator", !!h.operator);
for (const p of h.providers) console.log(p.id.padEnd(14), p.enabled ? "zapnuto" : "vypnuto", p.blocked ? "(blokováno)" : "")})'
```

   Správně: `demo false`, `affiliate true`, `shortLinks upstash`, `feedback true`, `operator true`;
   `ryanair`, `wizzair`, `kiwi`, `xotelo`, `liteapi` **vypnuto**, `travelpayouts` a `osm` **zapnuto**;
   `regiojet` podle rozhodnutí (`REGIOJET_LIVE=0` → vypnuto).
3. `https://letsi.cz/healthz` → `ok`; `https://letsi.cz/api/places?q=praha` → seznam míst.
4. Na telefonu (bez hledání na produkci z tohoto návodu – hledání spustí běžný uživatel, ne kontrola):
   - O aplikaci: „Ceny letenek jsou orientační – co za posledních 48 h našli jiní na Aviasales. K nákupu tě pošlu
     tam.“, Letenky jen Travelpayouts / Aviasales, Ubytování bez TripAdvisoru, Vlak a bus podle `REGIOJET_LIVE`,
     správce a e-mail vyplněné;
   - Zdroje cen (počítač, levý panel): „Ceny orientačně · 2 zdroje“ (Aviasales a OpenStreetMap; RegioJet se mezi
     zdroje cen nepočítá);
   - `/soukromi` a `/podminky` bez „doplníme“, s datem účinnosti.
5. `https://letsi.cz/robots.txt`, `/sitemap.xml` (3 adresy) a náhled odkazu (`og:image`) – dnes v pořádku, jen
   kontrola.
6. Log Renderu (Logs): po startu `Zdroje dat: Ubytování (OpenStreetMap), Letenky (Aviasales)` (s `, RegioJet`, když
   je zapnutý) a **žádné** `⚠️  STATS_KEY není nastavený`; s prvním požadavkem jednou řádek
   „Limity: adresa klienta z CF-Connecting-IP (Cloudflare)“.

## Po dnu D

- První týden denně `/api/health`: `providers[travelpayouts].blocked` (429 od Aviasales), `searches.queued`
  a `cache.trims`, `clientErrors`. V logu 503 „hledá pro hodně lidí“ → `docs/skalovani.md`, Další kroky.
- Statistiky (`statistiky.html`): počty jsou po dnech a drží se 400 dní – testovací listopad a prosinec jsou
  v období 30 a 90 dní ještě vidět, srovnávat dny od 12. 1.
- **Příruční zavazadlo od 23. 10. 2027** (nařízení (EU) 2026/2202, čl. 11a nařízení 261/2004 –
  https://eur-lex.europa.eu/eli/reg/2026/2202/oj/ces): výchozí cena letenky před rezervací musí zahrnovat kabinový
  kufr, týká se i metavyhledávačů. Do září 2027 přepnout výchozí zavazadlo z „Jen malé pod sedadlo“ na kabinový kufr
  (`public/js/flights.js` `defaultForm()`, tlačítko v `public/index.html`, `server/lib/search.js` `normalizeQuery()`,
  test `test/baggage.test.js`), stejně radar, hlídání a sdílené odkazy; staré uložené hledání bez `bags` nesmí
  ukázat falešné „zdražení“. Volba „bez kufru“ může zůstat jako dobrovolná.

## Data testerů

- V prohlížeči (cesty, hlídané ceny, nastavení) zůstávají – letsi.cz je stejná adresa, nic se nemaže.
- Na serveru (Upstash): krátké odkazy na sdílené cesty platí 400 dní od sdílení, souhrnné denní počty 400 dní,
  záznamy návštěv (jen se souhlasem) se mažou do 31 dnů. Nic z toho není potřeba ručně mazat; zásady to popisují.
- Mezipaměť cen je jen v RAM – nasazení na D ji smaže, staré živé ceny Ryanairu a Wizz Air po přepnutí nikde nezůstanou.

## Návrat zpět

Kdyby čistý režim nefungoval (Aviasales blokuje, žádné ceny): na Renderu smazat `RYANAIR_ENABLED`, `WIZZ_ENABLED`,
`KIWI_ENABLED`, `XOTELO` (výchozí = zapnuto) → Save, rebuild, and deploy. Jen dočasně – podmínky zdrojů se tím nemění.
