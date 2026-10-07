// Cesta z domova na letiště odletu (a zpět): odhad ceny na osobu a času veřejnou dopravou, nebo autem.
//
// 🚌 Veřejnou dopravou (výchozí), na osobu a jeden směr:
//   jízdenka vlak/bus z domova do města letiště (model podle vzdálenosti z ground.js – kalibrovaný na nejnižších
//   cenách RegioJetu a FlixBusu, Praha ↔ Vídeň, Berlín, Mnichov… změřené; na kratší vzdálenost regionální jízdné)
//   + cesta z města na letiště (MHD, S-Bahn, letištní bus – tabulka ACCESS) + příplatek za mezinárodní spoj
//   (vázaný spoj v daný čas, méně levných jízdenek přes hranici). Letiště ve městě domova = jen jízdenka MHD,
//   letiště do 50 km za humny (blíž než jeho město) = regionální bus/vlak rovnou na letiště; jede-li z města domova
//   přímý bus až na letiště (Praha → Mnichov, Vídeň, Berlín; Brno → Vídeň – tabulka DIRECT), počítá se levnější.
// 🚗 Autem: palivo tam i zpět (silniční km × spotřeba / 100 × cena – nafta 6 l/100 km nebo benzín 7 l/100 km za
//   aktuální cenu v zemi domova z fuel.js, elektroauto 19 kWh/100 km za nabíjení DC ~16 Kč/kWh, nebo vlastní cena)
//   + parkování u letiště podle délky cesty + dálniční známka / mýtné v cizině, vše děleno počtem cestujících. Jen tam
//   (parkování neznámé) = někdo tě odveze: palivo tam i zpět, bez parkování. Dřívější dotazy jen s Kč/km (carKmCzk
//   bez carFuel) počítají jako dřív: silniční km × Kč/km.
// Vždy jen odhad, na síť se nečeká – ceníky dopravců 2025/26 zaokrouhlené (~25 Kč/€, ~5,8 Kč/zł, ~0,065 Kč/Ft),
// parkoviště ověřená 10/2026 (24,4 Kč/€, 5,8 Kč/zł, 0,064 Kč/Ft), ceny paliva poslední stažené z fuel.js; RegioJet se tu
// neptá. Zdroje a předpoklady viz README → „Doprava na letiště“.
//
// Pozor: cyklus importů places.js → access.js → ground.js → places.js – na nejvyšší úrovni modulu proto nic
// z ground.js nevolat (jen uvnitř funkcí).
import { haversineKm } from './geo.js';
import { airportsNear, getAirport } from './airports.js';
import { CHEAP_CC, CITIES, MEASURED, MOUNTAIN_SLOW, PRAHA_RJ, distanceModel, groundPlace, landKm, mountainsOn } from './ground.js';
import { COUNTRIES as FUEL_CC, DEFAULT_KWH_PER_100, DEFAULT_L_PER_100, EV_DC, EV_LABEL, fuelPrice } from './fuel.js';

// Letiště do ~450 km od Česka: [šířka, délka středu města, které obsluhuje, město, jízdné město → letiště (Kč/os.),
// minuty, čím, parkování za auto [základ Kč, Kč za každý den]]. Parkování = nejlevnější oficiální dlouhodobé parkoviště
// s rezervací online předem (nebo smluvní s kyvadlovou dopravou, když je zjevně levnější): celkem základ + den × počet
// dní – krátké stání bývá dražší na den než dlouhé; [0, 0] = zdarma. Ověřeno 10/2026: ceny zjištěné 6. 10. 2026 (Vratislav
// 7. 10.) pro auto přijíždějící 27. 10. (Praha, Vídeň) a 28. 10. 2026 (ostatní; 24,4 Kč/€, 5,8 Kč/zł, 0,064 Kč/Ft) na
// 1 / 3 / 7 / 14 dní proložené nejmenšími čtverci; * = ceník po týdnech (nebo silně degresivní – Vratislav), jedna přímka
// přes 1–14 dní sedí špatně → proloženo jen 3–14 dní (typická cesta), jeden den pak vyjde dráž. V závorce pro srovnání
// většinou cena na místě bez rezervace (bývá dráž):
//   PRG booking.prg.aero, aeroparking.cz 780 / 850 / 1 450 / 2 280 Kč → 590 + 120 (před T3 1 000 / 1 700 / 2 500 / 3 900)
//   VIE Mazur s kyvadlovou dopravou 791 / 1 420 / 2 096 / 2 828 Kč → 850 + 150 (Parkplatz C online 827 / … / 4 071)
//   BRQ ceník letiště od 1. 1. 2025 (online voucher stejně) 300 / 650 / 1 300 / 2 350 Kč → 170 + 160
//   OSR P3–P6 130 Kč/den, rezervace online (parkum.app) za stejnou cenu → 0 + 130; PED P1 + P2 zdarma bez rezervace
//   KLV P4 / P5 online 500 Kč za započatý týden (8 dní): 500 / 500 / 500 / 1 000 Kč → 280 + 50* (P4 200 / 400 / 700 /
//       1 300 Kč; P7 zdarma, ale bez záruky volného místa)
//   BTS Parking Airport Bratislava (parkingairport.sk, kyvadlová doprava zdarma) 35 / 41 / 50 / 90 € → 670 + 100;
//       letiště P2 online 36 / 55 / 95 / 170 €
//   LNZ C1 Charter, rezervace nejde: 16,70 / 40 / 63 / 86 € → 740 + 100*
//   SZG P3 / P7, ceník na místě (sezóna B 24. 10.–1. 11.; online obchod nedostupný) 27 / 59 / 65 / 90 € → 1 170 + 70*
//   MUC Economy online 33,99 / 45,99 / 63,99 / 87,99 € → 790 + 100 (34 / 66 / 107 / 160 €)
//   NUE P31 / P4 Standard online, hlavní sezóna do 8. 11.: 38 / 91 / 131 / 192 € → 1 580 + 220* (18. 11. jen 30 / 65 /
//       87 / 129 €; P3 na místě 57 / 112 / 163 / 234 €)
//   BER Economy online (APCOA) 34 / 64 / 80 / 109 € → 1 260 + 100* (P107 24 €/den, 89 €/týden)
//   DRS P2 Flex Plus online 27 / 37 / 57 / 92 € → 540 + 120 (Parkhaus 40 / 80 / 105 / 140 €)
//   LEJ nejlevnější online (P6, P2, Parkhaus) 30 / 50 / 90 / 115 € → 750 + 160 (P2 60 / 75 / 95 / 130 €)
//   KTW P4 / P5 online (−5 %) 37 / 66 / 132 / 189 zł → 190 + 70 (39 / 69 / 139 / 199 zł)
//   KRK KRK Parking (350 m od terminálu) online 80 / 120 / 200 / 280 zł → 430 + 90 (P2 / P3 160 / 200 / 280 / 420 zł)
//   WRO Parking D dlouhodobý online (rezerwacja.airport.wroclaw.pl, ověřeno 10/2026) 79 / 139 / 199 / 269 zł → 630 + 70*
//       (první den 79 zł, 7–9 dní stejně 199 zł; celý online ceník 3–16 dní sedí do ±11 %; bez rezervace 99 / 189 / 319 /
//       389 zł)
//   BUD Relax Parking (bus k terminálu) online 5 831 / 9 150 / 13 200 / 16 725 Ft → 400 + 50 (7 800 / … / 32 400 Ft)
// Ostatní letiště jsou odhad z dřívější denní sazby p (týden ≈ 8 × p): velká (p ≥ 250 Kč) jako Praha a Vídeň – základ
// ≈ 2,9 × p + ≈ 0,55 × p za den, menší a regionální (p ≤ 220 Kč) nižší základ ≈ 1,5 × p + ≈ 0,8 × p za den. Zdroje viz
// README → „Doprava na letiště“.
// Memmingen obsluhuje Mnichov (letištní bus), Modlin Varšavu. Ostatní letiště: výchozí hodnoty podle velikosti.
export const ACCESS = {
  PRG: [50.0755, 14.4378, 'Praha', 46, 45, 'MHD – bus 59 + metro A (PID 90 min; Airport Express 200 Kč)', [590, 120]], // ověřeno 10/2026
  BRQ: [49.1951, 16.6068, 'Brno', 30, 30, 'bus E76 z hlavního nádraží (IDS JMK)', [170, 160]], // ověřeno 10/2026
  OSR: [49.8346, 18.2820, 'Ostrava', 50, 45, 'vlak do Mošnova (ODIS)', [0, 130]], // ověřeno 10/2026
  PED: [50.0343, 15.7812, 'Pardubice', 25, 20, 'MHD Pardubice', [0, 0]], // ověřeno 10/2026: zdarma
  KLV: [50.2310, 12.8714, 'Karlovy Vary', 30, 20, 'MHD Karlovy Vary', [280, 50]], // ověřeno 10/2026
  JCL: [48.9745, 14.4743, 'České Budějovice', 25, 25, 'MHD České Budějovice', [120, 60]],
  VIE: [48.2082, 16.3738, 'Vídeň', 110, 40, 'vlak S7 / Railjet z centra (~4,40 €; CAT 14,90 €)', [850, 150]], // ověřeno 10/2026
  BTS: [48.1486, 17.1077, 'Bratislava', 35, 30, 'MHD bus 61 (60 min)', [670, 100]], // ověřeno 10/2026
  LNZ: [48.3069, 14.2858, 'Linec', 90, 30, 'bus / vlak do Hörschingu (~3,50 €)', [740, 100]], // ověřeno 10/2026
  SZG: [47.8095, 13.0550, 'Salcburk', 65, 25, 'trolejbus 2 / 10 (~2,50 €)', [1170, 70]], // ověřeno 10/2026
  MUC: [48.1374, 11.5755, 'Mnichov', 350, 45, 'S-Bahn S1 / S8 z centra (MVV ~14 €)', [790, 100]], // ověřeno 10/2026
  NUE: [49.4521, 11.0767, 'Norimberk', 95, 20, 'metro U2 (VGN ~3,80 €)', [1580, 220]], // ověřeno 10/2026
  FMM: [48.1374, 11.5755, 'Mnichov', 450, 110, 'Allgäu Airport Express z Mnichova (~18 €)', [230, 120]],
  BER: [52.5200, 13.4050, 'Berlín', 120, 40, 'S-Bahn / FEX z centra (BVG ABC ~4,70 €)', [1260, 100]], // ověřeno 10/2026
  DRS: [51.0504, 13.7373, 'Drážďany', 85, 25, 'S-Bahn S2 z Hauptbahnhofu (DVB ~3,40 €)', [540, 120]], // ověřeno 10/2026
  LEJ: [51.3397, 12.3731, 'Lipsko', 130, 20, 'S-Bahn z Hauptbahnhofu (MDV ~5 €)', [750, 160]], // ověřeno 10/2026
  ERF: [50.9787, 11.0328, 'Erfurt', 70, 25, 'tramvaj 4 (~2,60 €)', [230, 120]],
  FRA: [50.1109, 8.6821, 'Frankfurt nad Mohanem', 155, 20, 'S-Bahn S8 / S9 z centra (RMV ~6,20 €)', [1450, 280]],
  KTW: [50.2649, 19.0238, 'Katovice', 150, 50, 'letištní bus do Pyrzowic (~25 zł)', [190, 70]], // ověřeno 10/2026
  KRK: [50.0647, 19.9450, 'Krakov', 80, 30, 'vlak z Kraków Główny (~14 zł)', [430, 90]], // ověřeno 10/2026
  WRO: [51.1079, 17.0385, 'Vratislav', 30, 35, 'MHD bus 106 (~4,60 zł)', [630, 70]], // ověřeno 10/2026
  POZ: [52.4064, 16.9252, 'Poznaň', 30, 30, 'MHD bus 159 (~5 zł)', [230, 120]],
  WAW: [52.2297, 21.0122, 'Varšava', 30, 30, 'vlak / bus 175 (ZTM ~4,40 zł)', [300, 160]],
  WMI: [52.2297, 21.0122, 'Varšava', 120, 60, 'vlak KM + bus do Modlinu (~20 zł)', [180, 100]],
  IEG: [51.9356, 15.5062, 'Zelená Hora', 85, 50, 'bus do Babimostu (~15 zł)', [120, 60]],
  BUD: [47.4979, 19.0402, 'Budapešť', 140, 45, 'bus 100E z centra (2 200 Ft)', [400, 50]], // ověřeno 10/2026
  KSC: [48.7164, 21.2611, 'Košice', 30, 25, 'MHD bus 23 (~1 €)', [230, 120]],
  TAT: [49.0598, 20.2975, 'Poprad', 30, 15, 'MHD / taxi', [150, 80]],
  SLD: [48.7363, 19.1462, 'Banská Bystrica', 60, 30, 'bus z Banské Bystrice (~2 €)', [150, 80]],
  GRZ: [47.0707, 15.4395, 'Štýrský Hradec', 80, 20, 'vlak S5 (~3 €)', [730, 140]],
  KLU: [46.6365, 14.3122, 'Klagenfurt', 75, 20, 'bus (~2,80 €)', [300, 160]],
  INN: [47.2692, 11.4041, 'Innsbruck', 80, 20, 'bus F (~3 €)', [730, 140]],
  LJU: [46.0569, 14.5058, 'Lublaň', 105, 50, 'bus z autobusového nádraží (~4,10 €)', [730, 140]],
  ZAG: [45.8150, 15.9819, 'Záhřeb', 200, 35, 'letištní bus Pleso (~8 €)', [300, 160]],
};
// Přímý bus z města domova až na letiště (bez přestupu ve městě letiště): [nejnižší cena Kč/os., minuty jízdy, čím].
// Změřeno 6. 10. 2026 v API RegioJetu a FlixBusu na odjezdy 20. 10. a 12. 11. 2026: Praha → Mnichov letiště RegioJet
// 1× denně 299–499 Kč, FlixBus 2–3× 449–479 Kč (počítá se 399); Praha → Vídeň-Schwechat RegioJet 4× denně od 369 Kč,
// FlixBus 7× od 439 Kč; Praha → Berlín BER FlixBus 9–12× od 419 Kč; Brno → Vídeň-Schwechat RegioJet i FlixBus
// 10–14× denně od 249 Kč. Přes město + S-Bahn by Mnichov vyšel na ~710 Kč. Klíč: město z ground.json > letiště.
const DIRECT = {
  'Praha>MUC': [399, 300, 'přímým busem (RegioJet, FlixBus)'],
  'Praha>VIE': [369, 295, 'přímým busem (RegioJet, FlixBus)'],
  'Praha>BER': [419, 250, 'přímým busem (FlixBus)'],
  'Brno>VIE': [249, 110, 'přímým busem (RegioJet, FlixBus)'],
};
// Změřená cena spoje z města domova do města letiště (dál MHD / S-Bahn z tabulky ACCESS): [Kč/os., minuty jízdy, čím].
// Je to běžná cena konkrétních spojů, ne „od“ – příplatek za mezinárodní spoj se k ní nepřičítá. Změřeno 6. 10. 2026:
// Praha → Drážďany FlixBus 319–339 Kč, RegioJet 369 Kč, vlak ČD / DB 623–647 Kč (model podle vzdálenosti dával ~240 Kč).
const FARE = {
  'Praha>DRS': [340, 115, 'busem (FlixBus, RegioJet)'],
};
// Jízdenka MHD na ~60–90 min podle země (Kč) – pro letiště mimo tabulku.
export const LOCAL_TICKET = { CZ: 30, SK: 35, PL: 25, HU: 30, AT: 80, DE: 85, SI: 40, HR: 40, IT: 50, CH: 100, _: 60 };
// Parkování za auto [základ Kč, Kč za den] u letiště mimo tabulku, podle velikosti (L velké, M střední, S malé) – stejný
// odhad jako v tabulce z dřívějších denních sazeb 250 / 150 / 100 Kč.
const PARK_DEFAULT = { L: [730, 140], M: [230, 120], S: [150, 80] };
// Dálniční známky a mýtné pro hrubý odhad (Kč za auto, 2026: Rakousko 12,80 €, Slovensko 10,80 €, Maďarsko 6 900 Ft,
// Slovinsko 16 € – ověřeno 10/2026). days = platnost (na delší cestu druhá), 0 = mýtné za každou jízdu. Německo a Polsko
// (A1, A4 k Vratislavi) pro auta bez poplatku.
export const TOLLS = {
  AT: { czk: 320, days: 10, label: 'dálniční známka Rakousko (10 dní)' },
  SK: { czk: 270, days: 10, label: 'e-známka Slovensko (10 dní)' },
  HU: { czk: 430, days: 10, label: 'e-známka Maďarsko (10 dní)' },
  SI: { czk: 400, days: 7, label: 'e-známka Slovinsko (7 dní)' },
  CZ: { czk: 290, days: 10, label: 'e-známka Česko (10 dní)' },
  CH: { czk: 1050, days: 365, label: 'dálniční známka Švýcarsko (rok)' },
  HR: { czk: 150, days: 0, label: 'mýtné Chorvatsko (každá jízda)' },
  IT: { czk: 300, days: 0, label: 'mýtné Itálie (každá jízda)' },
};
// Přes které země vede cesta autem (domov → země letiště), když nejsou sousední; jinak jen země letiště.
const VIA = {
  CZ: { HU: ['SK', 'HU'], SI: ['AT', 'SI'], HR: ['AT', 'SI', 'HR'], IT: ['AT', 'IT'], CH: ['DE', 'CH'] },
  SK: { DE: ['CZ', 'DE'], SI: ['AT', 'SI'], HR: ['HU', 'HR'] },
  PL: { AT: ['CZ', 'AT'], HU: ['SK', 'HU'], SI: ['CZ', 'AT', 'SI'] },
  DE: { SK: ['CZ', 'SK'], HU: ['AT', 'HU'], SI: ['AT', 'SI'] },
  AT: { PL: ['CZ', 'PL'] },
  HU: { CZ: ['SK', 'CZ'], DE: ['AT', 'DE'], PL: ['SK', 'PL'] },
};

export const CAR_KM_CZK = 2.6; // dřívější výchozí Kč/km za auto (6,5 l/100 km × ~40 Kč/l) – jen dotazy s carKmCzk
export const LEGACY_KM_RATE = 1.1; // dřívější výchozí sazba Kč/km (uložená hledání a hlídané ceny)
// Pohon auta: název v popiscích, jednotka, výchozí spotřeba na 100 km a meze spotřeby a vlastní ceny (Kč/l, Kč/kWh).
// Prohlížeč má totéž (SearchHelp.CAR_FUELS) – test hlídá shodu.
export const CAR_FUELS = {
  diesel: { name: 'nafta', unit: 'l', cons: DEFAULT_L_PER_100.diesel, consRange: [2, 30], priceRange: [5, 150] },
  petrol: { name: 'benzín N95', unit: 'l', cons: DEFAULT_L_PER_100.petrol, consRange: [2, 30], priceRange: [5, 150] },
  ev: { name: 'nabíjení', unit: 'kWh', cons: DEFAULT_KWH_PER_100, consRange: [8, 40], priceRange: [1, 40] },
};
export const DEFAULT_CAR_FUEL = 'diesel';
// cena v sousední zemi: „nafta 55,11 Kč/l v Rakousku · Oil Bulletin EU, k 28. 9. 2026“
const FUEL_IN = { DE: 'v Německu', AT: 'v Rakousku', SK: 'na Slovensku', PL: 'v Polsku', HU: 'v Maďarsku' };
const CITY_KM = 15; // domov do 15 km od středu města letiště = cesta MHD
const NEAR_KM = 50; // letiště za humny: regionální spoj rovnou na letiště
const ROAD = 1.25; // silnice ≈ 1,25 × vzdušná čára

const r10 = (x) => Math.round(x / 10) * 10;
const r5 = (m) => Math.max(5, Math.round(m / 5) * 5);
const regionalCzk = (km) => 30 + 1.5 * km; // regionální bus / vlak (~10 km 45 Kč, ~50 km 105 Kč)
const regionalMin = (km) => 15 + 1.1 * km;
// Parkování v rozpisu: „online předem (590 Kč + 120 Kč za den)“, bez základu jen sazba za den (Ostrava), [0, 0] zdarma.
const parkLabel = (base, day) => (!base && !day ? 'parkování u letiště zdarma'
  : `parkování u letiště online předem (${base ? `${base} Kč + ` : ''}${day} Kč za den)`);

/**
 * Město, které letiště obsluhuje, a cesta z něj na letiště: { lat, lon, label, czk, min, how, parkBase, parkDay, known }.
 * Parkování za auto: celkem parkBase + parkDay × počet dní (online předem).
 */
export function airportCity(a) {
  const x = ACCESS[a.iata];
  if (x) return { lat: x[0], lon: x[1], label: x[2], czk: x[3], min: x[4], how: x[5], parkBase: x[6][0], parkDay: x[6][1], known: true };
  const big = a.type === 'L';
  const [parkBase, parkDay] = PARK_DEFAULT[a.type] || PARK_DEFAULT.M;
  return {
    lat: a.lat, lon: a.lon, label: a.cityCs, czk: (LOCAL_TICKET[a.cc] ?? LOCAL_TICKET._) + (big ? 40 : 20), min: big ? 35 : a.type === 'M' ? 30 : 25,
    how: big ? 'letištní bus / MHD' : 'MHD / bus', parkBase, parkDay, known: false,
  };
}

// Země místa bez kódu země (poloha, město z geokódování): nejbližší město z dat ground.json do 60 km, jinak nejbližší
// letiště. Jen podle letiště by sever Čech (Ústí n. L., Teplice, Děčín, Varnsdorf – nejblíž Drážďany) vyšel jako
// Německo: příplatek za mezinárodní spoj do Prahy a česká dálniční známka navíc.
function ccNear(p) {
  let best = null;
  let bestD = 60;
  for (const c of CITIES) {
    if (Math.abs(c.lat - p.lat) > 0.6 || Math.abs(c.lon - p.lon) > 0.9) continue;
    const d = haversineKm(p.lat, p.lon, c.lat, c.lon);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best?.cc || airportsNear(p.lat, p.lon, 150, { includeSmall: true, limit: 1 })[0]?.cc || '';
}
// Odkud se jede: výchozí místo; zadané letiště (ap:PRG = „Praha“) → střed jeho města (do 35 km od letiště).
function origin(home) {
  const a = home.iata ? getAirport(home.iata) : null;
  const c = a && ACCESS[a.iata];
  if (c && haversineKm(a.lat, a.lon, c[0], c[1]) <= 35) return { lat: c[0], lon: c[1], label: c[2], cc: a.cc };
  return { lat: home.lat, lon: home.lon, label: home.label || '', cc: String(home.cc || '').toUpperCase() || ccNear(home) };
}

/**
 * Země, jejíž cena nafty a benzínu platí pro cestu autem z domova (jako carAccess): CZ, DE, AT, SK, PL, HU, jiná → CZ.
 * Poloha bez kódu země podle nejbližšího města. Pro prohlížeč (access.fuelCc v /api/origins a /api/nearby).
 */
export function fuelCountry(home) {
  if (!home || !Number.isFinite(home.lat) || !Number.isFinite(home.lon)) return 'CZ';
  const cc = origin(home).cc;
  return FUEL_CC.includes(cc) ? cc : 'CZ';
}

/** Vlak / bus mezi městy (Kč/os., min): změřená cesta z/do Prahy, jinak model podle vzdálenosti, na kratší regionální jízdné. */
function intercity(a, b) {
  const km = landKm(a, b);
  const pa = groundPlace(a);
  const pb = groundPlace(b);
  const other = pa?.rj === PRAHA_RJ ? pb?.rj : pb?.rj === PRAHA_RJ ? pa?.rj : null;
  const m = other && MEASURED[other];
  if (m) return { czk: m.czk, min: m.min, measured: true };
  const dm = distanceModel(km, mountainsOn(a, b) ? MOUNTAIN_SLOW : 1, CHEAP_CC.has(a.cc) && CHEAP_CC.has(b.cc));
  return { czk: Math.min(dm.czk, regionalCzk(km)), min: Math.min(dm.minutes, regionalMin(km)) };
}

/** Příplatek za mezinárodní spoj (Kč/os.): mezi Českem, Slovenskem, Polskem a Maďarskem 30 Kč, jinak 20 % (aspoň 50 Kč). */
export function borderCzk(fromCc, toCc, base) {
  if (!fromCc || !toCc || fromCc === toCc) return 0;
  if (CHEAP_CC.has(fromCc) && CHEAP_CC.has(toCc)) return 30;
  return Math.max(50, 0.2 * base);
}

/**
 * Veřejnou dopravou z domova na letiště, na osobu a jeden směr: { mode: 'transit', km, minutes, czk, local, breakdown }.
 * breakdown = rozpis [{ k: 'intercity' | 'regional' | 'access' | 'border', label, czk, min? }], ceny zaokrouhlené na 10 Kč
 * a vynásobené `scale` (kmRate: 0,5 = sleva 50 %); czk = jejich součet.
 */
export function transitAccess(home, a, { scale = 1 } = {}) {
  const o = origin(home);
  const c = airportCity(a);
  const km = haversineKm(o.lat, o.lon, a.lat, a.lon);
  const toCity = haversineKm(o.lat, o.lon, c.lat, c.lon);
  const items = []; // rozpis (breakdown)
  let minutes;
  let measured = false; // jízdné změřené na konkrétních spojích (FARE)
  if (toCity <= CITY_KM) {
    items.push({ k: 'access', label: c.how, czk: c.czk, min: c.min });
    minutes = c.min + 10; // na zastávku
  } else if (km < NEAR_KM && km + 5 < toCity) {
    items.push({ k: 'regional', label: 'regionální bus / vlak rovnou na letiště', czk: regionalCzk(km), min: regionalMin(km) });
    minutes = regionalMin(km) + 10;
  } else {
    const key = `${groundPlace(o)?.label}>${a.iata}`;
    // změřená cena spoje do města letiště (Praha → Drážďany), jinak model podle vzdálenosti
    const f = FARE[key];
    const ic = f ? { czk: f[0], min: f[1] } : intercity(o, { lat: c.lat, lon: c.lon, label: c.label, cc: a.cc });
    const d = DIRECT[key];
    const via = ic.czk + c.czk + (f ? 0 : borderCzk(o.cc, a.cc, ic.czk));
    if (d && d[0] + borderCzk(o.cc, a.cc, d[0]) < via) {
      items.push({ k: 'intercity', label: `${o.label ? `${o.label} → ` : ''}letiště ${c.label} ${d[2]}`, czk: d[0], min: d[1] });
      minutes = d[1] + 20; // na nádraží
    } else {
      items.push({ k: 'intercity', label: `${o.label ? `${o.label} → ` : ''}${c.label} ${f ? f[2] : 'vlakem / busem'}`, czk: ic.czk, min: ic.min });
      items.push({ k: 'access', label: c.how, czk: c.czk, min: c.min });
      minutes = ic.min + c.min + 20; // na nádraží a přestup
      measured = Boolean(f);
    }
  }
  // změřená cena konkrétních spojů už příplatek za mezinárodní spoj obsahuje
  const b = measured ? 0 : borderCzk(o.cc, a.cc, items[0].czk);
  if (b) items.push({ k: 'border', label: 'příplatek za mezinárodní spoj', czk: b });
  for (const x of items) x.czk = Math.max(scale > 0 ? 10 : 0, r10(x.czk * scale));
  return { mode: 'transit', km: Math.round(km), minutes: r5(minutes), czk: items.reduce((s, x) => s + x.czk, 0), local: items[0].k === 'access', breakdown: items };
}

/** Dálniční známky / mýtné na cestě autem z domova (země fromCc) do země letiště – domácí se nepočítá (máš ji). */
export function tollsOn(fromCc, toCc) {
  if (!fromCc || !toCc || fromCc === toCc) return [];
  const via = VIA[fromCc]?.[toCc] || [toCc];
  return via.filter((cc) => cc !== fromCc && TOLLS[cc]).map((cc) => ({ cc, ...TOLLS[cc] }));
}

const given = (v) => v != null && v !== '';
const clamp = (x, [lo, hi]) => Math.min(hi, Math.max(lo, x));
const comma = (x) => String(x).replace('.', ',');
/** Cena za litr / kWh v popisku: nafta a benzín vždy na haléře („50,65“), nabíjení celé bez desetin („16“, „8,50“). */
export const priceTxt = (fuel, x) => (CAR_FUELS[fuel]?.unit === 'l' || !Number.isInteger(x) ? x.toFixed(2).replace('.', ',') : String(x));

/**
 * Auto z dotazu: { carFuel, carCons, carPrice, carKmCzk }. carFuel 'diesel' (výchozí) | 'petrol' | 'ev', carCons =
 * spotřeba l nebo kWh na 100 km (výchozí 6 / 7 / 19, meze CAR_FUELS), carPrice = vlastní cena Kč/l nebo Kč/kWh (null =
 * aktuální). Dřívější dotaz jen s carKmCzk (bez carFuel – starší klient) zůstává v Kč/km: carFuel null, carKmCzk 0,5–10.
 */
export function normalizeCar(raw = {}) {
  if (!given(raw.carFuel) && given(raw.carKmCzk)) {
    const km = Number(raw.carKmCzk);
    return { carFuel: null, carCons: null, carPrice: null, carKmCzk: km > 0 ? Math.round(clamp(km, [0.5, 10]) * 10) / 10 : CAR_KM_CZK };
  }
  const fuel = ['diesel', 'petrol', 'ev'].includes(raw.carFuel) ? raw.carFuel : DEFAULT_CAR_FUEL;
  const f = CAR_FUELS[fuel];
  const cons = Number(raw.carCons);
  const price = Number(raw.carPrice);
  return {
    carFuel: fuel,
    carCons: given(raw.carCons) && cons > 0 ? Math.round(clamp(cons, f.consRange) * 10) / 10 : f.cons,
    carPrice: given(raw.carPrice) && price > 0 ? Math.round(clamp(price, f.priceRange) * 100) / 100 : null,
    carKmCzk: null,
  };
}

/**
 * Cena pohonu auta: { fuel, cons, unit, price, priceLabel, kmCzk, custom, country, date, source } | null (dřívější Kč/km).
 * price = vlastní cena, jinak u nafty a benzínu aktuální cena v zemi domova `country` (fuel.js – hned, bez čekání na síť;
 * neznámá země → ČR), u elektroauta odhad nabíjení DC (EV_DC). kmCzk = spotřeba / 100 × cena (Kč/km, přesně).
 * Stejně v prohlížeči SearchHelp.carEnergy (s cenami z /api/fuel).
 */
export function carEnergy(raw = {}, country = 'CZ') {
  const c = normalizeCar(raw);
  if (!c.carFuel) return null;
  const f = CAR_FUELS[c.carFuel];
  let price;
  let priceLabel;
  let src;
  if (c.carPrice) {
    price = c.carPrice;
    priceLabel = `${f.name} ${priceTxt(c.carFuel, price)} Kč/${f.unit} · vlastní cena`;
    src = { country: null, date: null, source: 'custom' };
  } else if (c.carFuel === 'ev') {
    price = EV_DC.default;
    priceLabel = EV_LABEL;
    src = { country: null, date: EV_DC.date, source: 'ev' };
  } else {
    const p = fuelPrice(country, c.carFuel);
    price = p.perLitre;
    priceLabel = `${f.name} ${priceTxt(c.carFuel, price)} Kč/l${FUEL_IN[p.country] ? ` ${FUEL_IN[p.country]}` : ''} · ${p.label}`;
    src = { country: p.country, date: p.date, source: p.source };
  }
  return { fuel: c.carFuel, cons: c.carCons, unit: f.unit, price, priceLabel, kmCzk: Math.round((c.carCons * price) / 100 * 1e5) / 1e5, custom: Boolean(c.carPrice), ...src };
}

/**
 * Autem na letiště: { mode: 'car', km, roadKm, minutes, czk, fuelCzk, carKmCzk, carFuel, parkBaseCzk, parkDayCzk, tolls, adults,
 * dropOff, breakdown }. fuelCzk = palivo jedním směrem za auto (round(roadKm × carKmCzk)), parkování za auto online předem
 * = parkBaseCzk + parkDayCzk × počet dní (parkStay), tolls = známky / mýtné za auto, breakdown = totéž jako rozpis
 * [{ k: 'fuel' | 'park' | 'toll', label, czk }] (za auto; parkování czk = za den, base = základ, obojí 0 = zdarma –
 * Pardubice); položka fuel navíc
 * { fuel, cons, unit, price, priceLabel, kmCzk, fuelCzk, custom, country, date,
 * source } (carEnergy; u dřívějšího Kč/km jen kmCzk a fuelCzk). czk = na osobu a jeden let: palivo jedním směrem + půl
 * známky (+ mýtné za jízdu); parkování podle délky cesty přidá optimalizátor (parkCzk). dropOff (jen tam): někdo tě
 * odveze – palivo tam i zpět, celá známka, bez parkování. Elektroauto platí parkování i známky stejně (výjimky ne).
 */
export function carAccess(home, a, opts = {}) {
  const { adults = 1, oneWay = false } = opts;
  const o = origin(home);
  const c = airportCity(a);
  const km = haversineKm(o.lat, o.lon, a.lat, a.lon);
  const roadKm = Math.max(3, Math.round(km * ROAD));
  const e = carEnergy(opts, o.cc || 'CZ');
  const kmCzk = e ? e.kmCzk : normalizeCar(opts).carKmCzk;
  const fuelCzk = Math.round(roadKm * kmCzk);
  const drive = (Math.min(roadKm, 30) / 40) * 60 + (Math.max(0, roadKm - 30) / 90) * 60;
  const tolls = tollsOn(o.cc, a.cc);
  const once = tolls.filter((t) => t.days).reduce((s, t) => s + t.czk, 0);
  const each = tolls.filter((t) => !t.days).reduce((s, t) => s + t.czk, 0);
  const n = Math.max(1, Math.round(adults) || 1);
  const czk = oneWay ? (2 * fuelCzk + once + 2 * each) / n : (fuelCzk + once / 2 + each) / n;
  const fuel = e
    ? { k: 'fuel', label: `${e.fuel === 'ev' ? 'nabíjení' : 'palivo'} jedním směrem (${roadKm} km × ${comma(e.cons)} ${e.unit}/100 km × ${priceTxt(e.fuel, e.price)} Kč/${e.unit})`, czk: fuelCzk, ...e, fuelCzk }
    : { k: 'fuel', label: `palivo jedním směrem (${roadKm} km × ${comma(kmCzk)} Kč)`, czk: fuelCzk, kmCzk, fuelCzk };
  const breakdown = [
    fuel,
    ...(oneWay ? [] : [{ k: 'park', label: parkLabel(c.parkBase, c.parkDay), czk: c.parkDay, base: c.parkBase }]),
    ...tolls.map((t) => ({ k: 'toll', label: t.label, czk: t.czk })),
  ];
  return {
    mode: 'car', km: Math.round(km), roadKm, minutes: r5(drive + 15), czk: Math.round(czk), local: false,
    fuelCzk, carKmCzk: kmCzk, carFuel: e ? e.fuel : null, parkBaseCzk: c.parkBase, parkDayCzk: c.parkDay, tolls, adults: n, dropOff: Boolean(oneWay), breakdown,
  };
}

/** Dní parkování pro cestu s N nocemi (odlet ráno, návrat večer = N + 1 započatých dní). */
export const parkDays = (nights) => Math.max(1, Math.round(Number(nights) || 0) + 1);
/**
 * Parkování u letiště za auto na `days` dní: základ + sazba za den (online předem, krátké stání je na den dražší).
 * Starší odpověď bez základu (parkBaseCzk) = jen sazba za den. Stejně v prohlížeči (SearchHelp.parkStay).
 */
export const parkStay = (g, days) => (Number(g.parkBaseCzk) || 0) + g.parkDayCzk * days;

/**
 * Autem tam i zpět s N nocemi: parkování u letiště (+ druhá známka, když první na celou cestu nevystačí), Kč/os.
 * Přičítá se k ceně celé cesty (ne k letišti) – stejně počítá prohlížeč (SearchHelp.parkCzk).
 */
export function parkCzk(g, nights) {
  if (!g || g.mode !== 'car' || g.off || g.dropOff) return 0;
  const days = parkDays(nights);
  const again = (g.tolls || []).filter((t) => t.days && days > t.days).reduce((s, t) => s + t.czk, 0);
  return Math.round((parkStay(g, days) + again) / (g.adults || 1));
}

/**
 * Celá cesta autem (tam i zpět s N nocemi, nebo odvoz u cesty jen tam): na osobu i rozpis za auto.
 * → { days, perPerson, fuel, park, tolls, total } (fuel/park/tolls/total za auto). Stejně v prohlížeči (SearchHelp.carTrip).
 */
export function carTrip(g, nights) {
  if (!g || g.mode !== 'car') return null;
  const n = g.adults || 1;
  const once = (g.tolls || []).filter((t) => t.days).reduce((s, t) => s + t.czk, 0);
  const each = (g.tolls || []).filter((t) => !t.days).reduce((s, t) => s + t.czk, 0);
  if (g.dropOff) return { days: 0, perPerson: g.czk, fuel: 2 * g.fuelCzk, park: 0, tolls: once + 2 * each, total: 2 * g.fuelCzk + once + 2 * each };
  const days = parkDays(nights);
  const again = (g.tolls || []).filter((t) => t.days && days > t.days).reduce((s, t) => s + t.czk, 0);
  const park = parkStay(g, days);
  const tolls = once + again + 2 * each;
  return { days, perPerson: g.off ? 0 : 2 * g.czk + parkCzk(g, nights), fuel: 2 * g.fuelCzk, park, tolls, total: 2 * g.fuelCzk + park + tolls };
}

/**
 * Cesta z domova na letiště podle voleb hledání: opts = { mode: 'transit' | 'car', scale (kmRate, 0 = nepočítat),
 * carFuel, carCons, carPrice (nebo dřívější carKmCzk), adults, oneWay }. Vypnutá doprava (scale 0) → czk 0 a off
 * (čas zůstává pro srovnání od dveří ke dveřím).
 */
export function airportAccess(home, iata, opts = {}) {
  const a = typeof iata === 'string' ? getAirport(iata) : iata;
  if (!home || !a || !Number.isFinite(home.lat) || !Number.isFinite(home.lon)) return null;
  const scale = opts.scale ?? 1;
  const g = opts.mode === 'car' ? carAccess(home, a, opts) : transitAccess(home, a, { scale: scale > 0 ? scale : 1 });
  return scale > 0 ? g : { ...g, czk: 0, off: true, breakdown: [] };
}

/**
 * Volby dopravy na letiště z dotazu: { groundMode: 'transit' | 'car', kmRate, carFuel, carCons, carPrice, carKmCzk }.
 * kmRate = násobek odhadu jízdného (0 = nepočítat, 1 = výchozí). Bez groundMode jde o dřívější Kč/km (výchozí 1,1 → 1).
 * Auto viz normalizeCar (carKmCzk jen u dřívějších dotazů bez carFuel, jinak null).
 */
export function normalizeAccess(raw = {}) {
  let rate = given(raw.kmRate) ? Number(raw.kmRate) : 1;
  if (!Number.isFinite(rate)) rate = 1;
  else if (given(raw.kmRate) && !given(raw.groundMode)) rate /= LEGACY_KM_RATE;
  return {
    groundMode: raw.groundMode === 'car' ? 'car' : 'transit',
    kmRate: Math.round(Math.min(5, Math.max(0, rate)) * 100) / 100,
    ...normalizeCar(raw),
  };
}

/** Pole auta pro další dotaz (úseky cesty přes víc měst): carFuel, carCons, carPrice, nebo dřívější carKmCzk. */
export const carQuery = (q) => (q.carFuel ? { carFuel: q.carFuel, carCons: q.carCons, ...(q.carPrice ? { carPrice: q.carPrice } : {}) } : { carKmCzk: q.carKmCzk });

/** Volby pro airportAccess z normalizovaného dotazu (normalizeQuery). */
export const accessOpts = (q, oneWay = false) => ({ mode: q.groundMode, scale: q.kmRate, ...carQuery(q), adults: q.adults, oneWay });
