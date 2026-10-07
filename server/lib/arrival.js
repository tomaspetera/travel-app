// Cesta z letiště příletu do města (a z města zpět na letiště odletu) veřejnou dopravou, na osobu a jeden směr.
// Levná letenka na vzdálené letiště (Paříž-Beauvais, Brusel-Charleroi, Barcelona-Girona, Oslo-Torp…) stojí navíc
// 15–25 € a hodinu i víc každým směrem – proto se cesta do města ukazuje u nabídek a (volba hledání „arrival“) přičítá
// k ceně. Odkud se bere, v tomto pořadí:
//  1. Ověřená tabulka data/arrival.json: letištní bus, vlak nebo metro do centra z oficiálních stránek letišť a dopravců
//     (pár výjimek se sekundárním zdrojem je označených), jízdné v místní měně → Kč kurzem ČNB, typický čas jízdy.
//  2. Letiště z tabulky cesty na letiště (access.js ACCESS – letiště do ~450 km od Česka): stejný spoj obráceně.
//  3. Ostatní: odhad podle vzdálenosti letiště od středu města (metropole s víc letišti: střed metropole, jinak typická
//     vzdálenost podle velikosti letiště) – regionální model z access.js (30 Kč + 1,5 Kč/km, 15 min + 1,1 min/km
//     + 10 min na zastávce) × cenová hladina země (countries.json), aspoň jízdenka MHD. Označený jako odhad.
// Vždy orientační: „od“ = nejnižší cena online předem, ceny dopravců se mění. Zdroje a datum viz README → „Z letiště
// do města“.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { haversineKm } from './geo.js';
import { COUNTRY_BY_ISO, METRO_BY_CODE, getAirport } from './airports.js';
import { ACCESS, LOCAL_TICKET, regionalCzk, regionalMin } from './access.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA = JSON.parse(readFileSync(path.join(root, 'data', 'arrival.json'), 'utf8'));
/** Ověřená tabulka: IATA → { city, gen, lat, lon, mode, how, fare, cur, from?, min, sec?, note?, src, date }. */
export const ARRIVAL = DATA.airports;
/** Kurzy pro převod jízdného do Kč (Kč za jednotku měny) a odkud jsou. */
export const ARRIVAL_FX = DATA.fx;
/** Kdy byla tabulka ověřená (YYYY-MM-DD). */
export const ARRIVAL_CHECKED = DATA.checked;
/**
 * Cesta do města, kterou UI zvýrazní jako drahou nebo dlouhou („levná“ letenka na vzdálené letiště): přes 350 Kč/os.
 * jedním směrem nebo přes hodinu – Beauvais, Charleroi, Girona, Torp, Weeze…, ne Paříž-CDG s vlakem za 14 €.
 */
export const ARRIVAL_WARN = { czk: 350, min: 60 };
export const ARRIVAL_MODES = ['bus', 'train', 'metro', 'tram'];

// Odhad mimo tabulky: cenová hladina země (countries.json cost 1–5) × regionální jízdné – nastavené podle ověřené
// tabulky (geometrický průměr odhad / skutečnost ~0,9, ¾ letišť do dvojnásobku; test v test/arrival.test.js).
export const PRICE_LEVEL = { 1: 0.5, 2: 1, 3: 2, 4: 2.8, 5: 4 };
// Letiště mimo metropoli s víc letišti: typická vzdálenost do centra podle velikosti (L velké, M střední, S malé).
export const TYPE_KM = { L: 15, M: 10, S: 6 };

const r10 = (x) => Math.max(10, Math.round(x / 10) * 10);
const r5 = (m) => Math.max(5, Math.round(m / 5) * 5);

/** Jízdné v Kč (zaokrouhlené na 10 Kč, aspoň 10) – neznámá měna → null. */
export function fareCzk(fare, cur) {
  const rate = ARRIVAL_FX.czk[String(cur || '').toUpperCase()];
  return rate && Number(fare) > 0 ? r10(Number(fare) * rate) : null;
}

/** Metropole s víc letišti, kam letiště patří (střed metropole), nebo null. */
function metroOf(iata) {
  for (const m of METRO_BY_CODE.values()) if (m.airports.includes(iata)) return m;
  return null;
}

function fromTable(a, x) {
  return {
    iata: a.iata, city: x.city, gen: x.gen, lat: x.lat, lon: x.lon, mode: x.mode, how: x.how,
    fare: x.fare, cur: x.cur, ...(x.from ? { from: true } : {}), czk: fareCzk(x.fare, x.cur), min: x.min,
    km: Math.round(haversineKm(a.lat, a.lon, x.lat, x.lon)), ...(x.note ? { note: x.note } : {}),
    src: x.src, date: x.date, ...(x.sec ? { sec: true } : {}), basis: 'table',
  };
}

// Tabulka cesty na letiště (access.js): [šířka, délka, město, Kč, minuty, čím, parkování]. Text je psaný směrem na
// letiště – „z centra“ → „do centra“, jiné místo („z Hauptbahnhofu“, „do Mošnova“) se vynechá.
export function accessHow(how) {
  return String(how || '').replace(/ z centra\b/, ' do centra').replace(/ (?:z|do) (?!centra\b)[^(]+?(?= \(|$)/, '');
}
const modeOf = (how) => (/^(?:vlak|S-Bahn)/.test(how) ? 'train' : /^metro/.test(how) ? 'metro' : /^tramvaj/.test(how) ? 'tram' : 'bus');

function fromAccess(a, x) {
  const how = accessHow(x[5]);
  return {
    iata: a.iata, city: x[2], gen: null, lat: x[0], lon: x[1], mode: modeOf(how), how, czk: x[3], min: x[4],
    km: Math.round(haversineKm(a.lat, a.lon, x[0], x[1])), basis: 'access',
  };
}

/** Odhad podle vzdálenosti a cenové hladiny země (viz hlavička souboru). */
export function estimateArrival(a) {
  const m = metroOf(a.iata);
  const km = m ? haversineKm(a.lat, a.lon, m.lat, m.lon) : TYPE_KM[a.type] ?? TYPE_KM.M;
  const level = PRICE_LEVEL[COUNTRY_BY_ISO.get(a.cc)?.cost] ?? PRICE_LEVEL[3];
  return {
    iata: a.iata, city: m ? m.cs : a.cityCs, gen: null, lat: m ? m.lat : a.lat, lon: m ? m.lon : a.lon, mode: 'bus',
    how: 'letištní bus / MHD do centra', czk: r10(Math.max(LOCAL_TICKET[a.cc] ?? LOCAL_TICKET._, regionalCzk(km) * level)),
    min: r5(regionalMin(km) + 10), km: Math.round(km), basis: 'estimate', est: true,
  };
}

const memo = new Map();
/**
 * Cesta z letiště `iata` do města, na osobu a jeden směr (tam i zpět stejně): { iata, city, gen, lat, lon, mode, how,
 * fare?, cur?, from?, czk, min, km, note?, src?, date?, sec?, basis: 'table' | 'access' | 'estimate', est? }.
 * gen = 2. pád názvu města („do Paříže“; u odhadu null → „do centra“). Neznámé letiště → null.
 */
export function arrivalTransfer(iata) {
  const code = String(iata || '').toUpperCase();
  if (memo.has(code)) return memo.get(code);
  const a = getAirport(code);
  const x = !a ? null : ARRIVAL[code] ? fromTable(a, ARRIVAL[code]) : ACCESS[code] ? fromAccess(a, ACCESS[code]) : estimateArrival(a);
  memo.set(code, x);
  return x;
}

/** Jen Kč/os. jedním směrem (0 = neznámé letiště). */
export const arrivalCzk = (iata) => arrivalTransfer(iata)?.czk ?? 0;

/**
 * Cesta z letiště do města k jednomu letu, Kč/os.: u letu tam z letiště příletu, u letu zpět na letiště odletu –
 * konce letu na letišti domova (`home`: odletová a přestupní letiště) se nepočítají. Cesta přes víc měst: lety mezi
 * městy mají cestu na obou koncích.
 */
export function legArrivalCzk(leg, home) {
  if (!leg) return 0;
  return (home.has(leg.from) ? 0 : arrivalCzk(leg.from)) + (home.has(leg.to) ? 0 : arrivalCzk(leg.to));
}

/** Volba z dotazu: přičíst cestu z letiště do města k ceně? Formulář ji posílá vždy; bez pole (dřívější dotazy) ne. */
export const arrivalOn = (v) => v === true || v === 1 || v === '1' || v === 'true';

/**
 * Cesty do města k letištím ve výsledcích (pro štítek a rozpis u nabídek): { IATA: arrivalTransfer } – letiště příletu
 * u letů tam a letiště odletu u letů zpět; `home` = letiště domova (nevrací se).
 */
export function arrivalsFor(trips, home = new Set()) {
  const out = {};
  for (const t of trips || []) {
    for (const iata of [t?.out?.to, t?.back?.from, t?.out?.from && !home.has(t.out.from) ? t.out.from : null]) {
      if (!iata || home.has(iata) || out[iata]) continue;
      const x = arrivalTransfer(iata);
      if (x) out[iata] = x;
    }
  }
  return out;
}
