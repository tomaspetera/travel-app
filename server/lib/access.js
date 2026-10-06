// Cesta z domova na letiště odletu (a zpět): odhad ceny na osobu a času veřejnou dopravou, nebo autem.
//
// 🚌 Veřejnou dopravou (výchozí), na osobu a jeden směr:
//   jízdenka vlak/bus z domova do města letiště (model podle vzdálenosti z ground.js – kalibrovaný na nejnižších
//   cenách RegioJetu a FlixBusu, Praha ↔ Vídeň, Berlín, Mnichov… změřené; na kratší vzdálenost regionální jízdné)
//   + cesta z města na letiště (MHD, S-Bahn, letištní bus – tabulka ACCESS) + příplatek za mezinárodní spoj
//   (vázaný spoj v daný čas, méně levných jízdenek přes hranici). Letiště ve městě domova = jen jízdenka MHD,
//   letiště do 50 km za humny (blíž než jeho město) = regionální bus/vlak rovnou na letiště.
// 🚗 Autem: palivo tam i zpět (silniční km × Kč/km, výchozí 6,5 l/100 km × ~40 Kč/l = 2,6 Kč/km) + parkování
//   u letiště podle délky cesty + dálniční známka / mýtné v cizině, vše děleno počtem cestujících. Jen tam
//   (parkování neznámé) = někdo tě odveze: palivo tam i zpět, bez parkování.
// Vždy jen odhad bez sítě – ceníky dopravců a parkovišť 2025/26 zaokrouhlené (~25 Kč/€, ~5,8 Kč/zł,
// ~0,065 Kč/Ft); RegioJet se tu neptá. Zdroje a předpoklady viz README → „Doprava na letiště“.
//
// Pozor: cyklus importů places.js → access.js → ground.js → places.js – na nejvyšší úrovni modulu proto nic
// z ground.js nevolat (jen uvnitř funkcí).
import { haversineKm } from './geo.js';
import { airportsNear, getAirport } from './airports.js';
import { CHEAP_CC, MEASURED, MOUNTAIN_SLOW, PRAHA_RJ, distanceModel, groundPlace, landKm, mountainsOn } from './ground.js';

// Letiště do ~450 km od Česka: [šířka, délka středu města, které obsluhuje, město, jízdné město → letiště (Kč/os.),
// minuty, čím, parkování Kč/den za auto (nejlevnější oficiální dlouhodobé / online parkoviště, zaokrouhleno)].
// Memmingen obsluhuje Mnichov (letištní bus), Modlin Varšavu. Ostatní letiště: výchozí hodnoty podle velikosti.
export const ACCESS = {
  PRG: [50.0755, 14.4378, 'Praha', 46, 45, 'MHD – bus 119 + metro (PID 90 min; Airport Express 100 Kč)', 200],
  BRQ: [49.1951, 16.6068, 'Brno', 30, 30, 'bus E76 z hlavního nádraží (IDS JMK)', 120],
  OSR: [49.8346, 18.2820, 'Ostrava', 50, 45, 'vlak do Mošnova (ODIS)', 100],
  PED: [50.0343, 15.7812, 'Pardubice', 25, 20, 'MHD Pardubice', 100],
  KLV: [50.2310, 12.8714, 'Karlovy Vary', 30, 20, 'MHD Karlovy Vary', 100],
  JCL: [48.9745, 14.4743, 'České Budějovice', 25, 25, 'MHD České Budějovice', 80],
  VIE: [48.2082, 16.3738, 'Vídeň', 110, 40, 'vlak S7 / Railjet z centra (~4,40 €; CAT 14,90 €)', 300],
  BTS: [48.1486, 17.1077, 'Bratislava', 35, 30, 'MHD bus 61 (60 min)', 175],
  LNZ: [48.3069, 14.2858, 'Linec', 90, 30, 'bus / vlak do Hörschingu (~3,50 €)', 175],
  SZG: [47.8095, 13.0550, 'Salcburk', 65, 25, 'trolejbus 2 / 10 (~2,50 €)', 300],
  MUC: [48.1374, 11.5755, 'Mnichov', 350, 45, 'S-Bahn S1 / S8 z centra (MVV ~14 €)', 400],
  NUE: [49.4521, 11.0767, 'Norimberk', 95, 20, 'metro U2 (VGN ~3,80 €)', 250],
  FMM: [48.1374, 11.5755, 'Mnichov', 450, 110, 'Allgäu Airport Express z Mnichova (~18 €)', 150],
  BER: [52.5200, 13.4050, 'Berlín', 120, 40, 'S-Bahn / FEX z centra (BVG ABC ~4,70 €)', 300],
  DRS: [51.0504, 13.7373, 'Drážďany', 85, 25, 'S-Bahn S2 z Hauptbahnhofu (DVB ~3,40 €)', 200],
  LEJ: [51.3397, 12.3731, 'Lipsko', 130, 20, 'S-Bahn z Hauptbahnhofu (MDV ~5 €)', 200],
  ERF: [50.9787, 11.0328, 'Erfurt', 70, 25, 'tramvaj 4 (~2,60 €)', 150],
  FRA: [50.1109, 8.6821, 'Frankfurt nad Mohanem', 155, 20, 'S-Bahn S8 / S9 z centra (RMV ~6,20 €)', 500],
  KTW: [50.2649, 19.0238, 'Katovice', 150, 50, 'letištní bus do Pyrzowic (~25 zł)', 150],
  KRK: [50.0647, 19.9450, 'Krakov', 80, 30, 'vlak z Kraków Główny (~14 zł)', 150],
  WRO: [51.1079, 17.0385, 'Vratislav', 30, 35, 'MHD bus 106 (~4,60 zł)', 150],
  POZ: [52.4064, 16.9252, 'Poznaň', 30, 30, 'MHD bus 159 (~5 zł)', 150],
  WAW: [52.2297, 21.0122, 'Varšava', 30, 30, 'vlak / bus 175 (ZTM ~4,40 zł)', 200],
  WMI: [52.2297, 21.0122, 'Varšava', 120, 60, 'vlak KM + bus do Modlinu (~20 zł)', 120],
  IEG: [51.9356, 15.5062, 'Zelená Hora', 85, 50, 'bus do Babimostu (~15 zł)', 80],
  BUD: [47.4979, 19.0402, 'Budapešť', 140, 45, 'bus 100E z centra (2 200 Ft)', 220],
  KSC: [48.7164, 21.2611, 'Košice', 30, 25, 'MHD bus 23 (~1 €)', 150],
  TAT: [49.0598, 20.2975, 'Poprad', 30, 15, 'MHD / taxi', 100],
  SLD: [48.7363, 19.1462, 'Banská Bystrica', 60, 30, 'bus z Banské Bystrice (~2 €)', 100],
  GRZ: [47.0707, 15.4395, 'Štýrský Hradec', 80, 20, 'vlak S5 (~3 €)', 250],
  KLU: [46.6365, 14.3122, 'Klagenfurt', 75, 20, 'bus (~2,80 €)', 200],
  INN: [47.2692, 11.4041, 'Innsbruck', 80, 20, 'bus F (~3 €)', 250],
  LJU: [46.0569, 14.5058, 'Lublaň', 105, 50, 'bus z autobusového nádraží (~4,10 €)', 250],
  ZAG: [45.8150, 15.9819, 'Záhřeb', 200, 35, 'letištní bus Pleso (~8 €)', 200],
};
// Jízdenka MHD na ~60–90 min podle země (Kč) – pro letiště mimo tabulku.
export const LOCAL_TICKET = { CZ: 30, SK: 35, PL: 25, HU: 30, AT: 80, DE: 85, SI: 40, HR: 40, IT: 50, CH: 100, _: 60 };
// Parkování Kč/den za auto u letiště mimo tabulku, podle velikosti (L velké, M střední, S malé).
const PARK_DEFAULT = { L: 250, M: 150, S: 100 };
// Dálniční známky a mýtné pro hrubý odhad (Kč za auto, 2025/26). days = platnost (na delší cestu druhá),
// 0 = mýtné za každou jízdu. Německo a Polsko (A1, A4 k Vratislavi) pro auta bez poplatku.
export const TOLLS = {
  AT: { czk: 320, days: 10, label: 'dálniční známka Rakousko (10 dní)' },
  SK: { czk: 300, days: 10, label: 'e-známka Slovensko (10 dní)' },
  HU: { czk: 400, days: 10, label: 'e-známka Maďarsko (10 dní)' },
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

export const CAR_KM_CZK = 2.6; // 6,5 l/100 km × ~40 Kč/l
export const LEGACY_KM_RATE = 1.1; // dřívější výchozí sazba Kč/km (uložená hledání a hlídané ceny)
const CITY_KM = 15; // domov do 15 km od středu města letiště = cesta MHD
const NEAR_KM = 50; // letiště za humny: regionální spoj rovnou na letiště
const ROAD = 1.25; // silnice ≈ 1,25 × vzdušná čára

const r10 = (x) => Math.round(x / 10) * 10;
const r5 = (m) => Math.max(5, Math.round(m / 5) * 5);
const regionalCzk = (km) => 30 + 1.5 * km; // regionální bus / vlak (~10 km 45 Kč, ~50 km 105 Kč)
const regionalMin = (km) => 15 + 1.1 * km;

/** Město, které letiště obsluhuje, a cesta z něj na letiště: { lat, lon, label, czk, min, how, parkDay, known }. */
export function airportCity(a) {
  const x = ACCESS[a.iata];
  if (x) return { lat: x[0], lon: x[1], label: x[2], czk: x[3], min: x[4], how: x[5], parkDay: x[6], known: true };
  const big = a.type === 'L';
  return {
    lat: a.lat, lon: a.lon, label: a.cityCs, czk: (LOCAL_TICKET[a.cc] ?? LOCAL_TICKET._) + (big ? 40 : 20), min: big ? 35 : a.type === 'M' ? 30 : 25,
    how: big ? 'letištní bus / MHD' : 'MHD / bus', parkDay: PARK_DEFAULT[a.type] || PARK_DEFAULT.M, known: false,
  };
}

const ccNear = (p) => airportsNear(p.lat, p.lon, 150, { includeSmall: true, limit: 1 })[0]?.cc || '';
// Odkud se jede: výchozí místo; zadané letiště (ap:PRG = „Praha“) → střed jeho města (do 35 km od letiště).
function origin(home) {
  const a = home.iata ? getAirport(home.iata) : null;
  const c = a && ACCESS[a.iata];
  if (c && haversineKm(a.lat, a.lon, c[0], c[1]) <= 35) return { lat: c[0], lon: c[1], label: c[2], cc: a.cc };
  return { lat: home.lat, lon: home.lon, label: home.label || '', cc: String(home.cc || '').toUpperCase() || ccNear(home) };
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
  if (toCity <= CITY_KM) {
    items.push({ k: 'access', label: c.how, czk: c.czk, min: c.min });
    minutes = c.min + 10; // na zastávku
  } else if (km < NEAR_KM && km + 5 < toCity) {
    items.push({ k: 'regional', label: 'regionální bus / vlak rovnou na letiště', czk: regionalCzk(km), min: regionalMin(km) });
    minutes = regionalMin(km) + 10;
  } else {
    const ic = intercity(o, { lat: c.lat, lon: c.lon, label: c.label, cc: a.cc });
    items.push({ k: 'intercity', label: `${o.label ? `${o.label} → ` : ''}${c.label} vlakem / busem`, czk: ic.czk, min: ic.min });
    items.push({ k: 'access', label: c.how, czk: c.czk, min: c.min });
    minutes = ic.min + c.min + 20; // na nádraží a přestup
  }
  const b = borderCzk(o.cc, a.cc, items[0].czk);
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

/**
 * Autem na letiště: { mode: 'car', km, roadKm, minutes, czk, fuelCzk, carKmCzk, parkDayCzk, tolls, adults, dropOff, breakdown }.
 * fuelCzk = palivo jedním směrem za auto, parkDayCzk = parkování za den za auto, tolls = známky / mýtné za auto,
 * breakdown = totéž jako rozpis [{ k: 'fuel' | 'park' | 'toll', label, czk }] (za auto; parkování za den).
 * czk = na osobu a jeden let: palivo jedním směrem + půl známky (+ mýtné za jízdu); parkování podle délky cesty
 * přidá optimalizátor (parkCzk). dropOff (jen tam): někdo tě odveze – palivo tam i zpět, celá známka, bez parkování.
 */
export function carAccess(home, a, { carKmCzk = CAR_KM_CZK, adults = 1, oneWay = false } = {}) {
  const o = origin(home);
  const c = airportCity(a);
  const km = haversineKm(o.lat, o.lon, a.lat, a.lon);
  const roadKm = Math.max(3, Math.round(km * ROAD));
  const fuelCzk = Math.round(roadKm * carKmCzk);
  const drive = (Math.min(roadKm, 30) / 40) * 60 + (Math.max(0, roadKm - 30) / 90) * 60;
  const tolls = tollsOn(o.cc, a.cc);
  const once = tolls.filter((t) => t.days).reduce((s, t) => s + t.czk, 0);
  const each = tolls.filter((t) => !t.days).reduce((s, t) => s + t.czk, 0);
  const n = Math.max(1, Math.round(adults) || 1);
  const czk = oneWay ? (2 * fuelCzk + once + 2 * each) / n : (fuelCzk + once / 2 + each) / n;
  const breakdown = [
    { k: 'fuel', label: `palivo jedním směrem (${roadKm} km × ${String(carKmCzk).replace('.', ',')} Kč)`, czk: fuelCzk },
    ...(oneWay ? [] : [{ k: 'park', label: 'parkování u letiště za den', czk: c.parkDay }]),
    ...tolls.map((t) => ({ k: 'toll', label: t.label, czk: t.czk })),
  ];
  return {
    mode: 'car', km: Math.round(km), roadKm, minutes: r5(drive + 15), czk: Math.round(czk), local: false,
    fuelCzk, carKmCzk, parkDayCzk: c.parkDay, tolls, adults: n, dropOff: Boolean(oneWay), breakdown,
  };
}

/** Dní parkování pro cestu s N nocemi (odlet ráno, návrat večer = N + 1 započatých dní). */
export const parkDays = (nights) => Math.max(1, Math.round(Number(nights) || 0) + 1);

/**
 * Autem tam i zpět s N nocemi: parkování u letiště (+ druhá známka, když první na celou cestu nevystačí), Kč/os.
 * Přičítá se k ceně celé cesty (ne k letišti) – stejně počítá prohlížeč (SearchHelp.parkCzk).
 */
export function parkCzk(g, nights) {
  if (!g || g.mode !== 'car' || g.off || g.dropOff) return 0;
  const days = parkDays(nights);
  const again = (g.tolls || []).filter((t) => t.days && days > t.days).reduce((s, t) => s + t.czk, 0);
  return Math.round((g.parkDayCzk * days + again) / (g.adults || 1));
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
  const park = g.parkDayCzk * days;
  const tolls = once + again + 2 * each;
  return { days, perPerson: g.off ? 0 : 2 * g.czk + parkCzk(g, nights), fuel: 2 * g.fuelCzk, park, tolls, total: 2 * g.fuelCzk + park + tolls };
}

/**
 * Cesta z domova na letiště podle voleb hledání: opts = { mode: 'transit' | 'car', scale (kmRate, 0 = nepočítat),
 * carKmCzk, adults, oneWay }. Vypnutá doprava (scale 0) → czk 0 a off (čas zůstává pro srovnání od dveří ke dveřím).
 */
export function airportAccess(home, iata, opts = {}) {
  const a = typeof iata === 'string' ? getAirport(iata) : iata;
  if (!home || !a || !Number.isFinite(home.lat) || !Number.isFinite(home.lon)) return null;
  const scale = opts.scale ?? 1;
  const g = opts.mode === 'car' ? carAccess(home, a, opts) : transitAccess(home, a, { scale: scale > 0 ? scale : 1 });
  return scale > 0 ? g : { ...g, czk: 0, off: true, breakdown: [] };
}

/**
 * Volby dopravy na letiště z dotazu: { groundMode: 'transit' | 'car', kmRate, carKmCzk }. kmRate = násobek odhadu
 * jízdného (0 = nepočítat, 1 = výchozí). Bez groundMode jde o dřívější Kč/km (výchozí 1,1 → 1).
 */
export function normalizeAccess(raw = {}) {
  const given = raw.kmRate != null && raw.kmRate !== '';
  let rate = given ? Number(raw.kmRate) : 1;
  if (!Number.isFinite(rate)) rate = 1;
  else if (given && (raw.groundMode == null || raw.groundMode === '')) rate /= LEGACY_KM_RATE;
  const car = Number(raw.carKmCzk);
  return {
    groundMode: raw.groundMode === 'car' ? 'car' : 'transit',
    kmRate: Math.round(Math.min(5, Math.max(0, rate)) * 100) / 100,
    carKmCzk: raw.carKmCzk != null && raw.carKmCzk !== '' && Number.isFinite(car) && car > 0 ? Math.round(Math.min(10, Math.max(0.5, car)) * 10) / 10 : CAR_KM_CZK,
  };
}

/** Volby pro airportAccess z normalizovaného dotazu (normalizeQuery). */
export const accessOpts = (q, oneWay = false) => ({ mode: q.groundMode, scale: q.kmRate, carKmCzk: q.carKmCzk, adults: q.adults, oneWay });
