// Dálkové lety: světadíly jako cíl, oblíbené dálkové země pro hledání „kamkoliv“, hlavní letiště
// dálkových zemí (Travelpayouts se ptá po cílech) a velká přestupní letiště v okolí domova,
// odkud se do Asie, Afriky nebo Ameriky často letí levněji (Vídeň, Mnichov, Berlín…).
import { COUNTRIES, airportsInCountry, getAirport } from './airports.js';
import { groundEstimate, haversineKm } from './geo.js';

// Světadíly / oblasti. `cont` = hodnota z data/countries.json, `list` = výčet zemí.
// `sweep` = nejoblíbenější země v pořadí, ve kterém se prohledávají (Kiwi: 1 dotaz na zemi).
export const CONTINENTS = [
  { key: 'asia', cs: 'Asie', flag: '🌏', aliases: ['asie', 'asia', 'jihovychodni asie', 'dalny vychod'], cont: 'Asie',
    sweep: ['TH', 'AE', 'VN', 'ID', 'JP', 'LK', 'MV', 'MY', 'PH', 'KR', 'IN', 'SG', 'CN', 'NP', 'OM', 'JO'] },
  { key: 'africa', cs: 'Afrika', flag: '🌍', aliases: ['afrika', 'africa', 'subsaharska afrika'], cont: 'Afrika',
    sweep: ['EG', 'MA', 'TN', 'KE', 'TZ', 'ZA', 'CV', 'MU', 'SC', 'NA', 'SN', 'GH', 'ET', 'MG', 'RW', 'UG'] },
  { key: 'mideast', cs: 'Blízký východ', flag: '🕌', aliases: ['blizky vychod', 'stredni vychod', 'middle east', 'arabie', 'persky zaliv'],
    list: ['AE', 'OM', 'QA', 'BH', 'KW', 'SA', 'JO', 'IL', 'LB', 'IQ', 'IR', 'YE', 'SY'],
    sweep: ['AE', 'OM', 'QA', 'JO', 'IL', 'SA', 'BH', 'LB'] },
  { key: 'namerica', cs: 'Severní a Střední Amerika', flag: '🗽', aliases: ['amerika', 'severni amerika', 'stredni amerika', 'karibik', 'north america', 'america'], cont: 'Severní Amerika',
    sweep: ['US', 'MX', 'DO', 'CU', 'CA', 'CR', 'PA', 'JM', 'BS', 'GT', 'BB'] },
  { key: 'samerica', cs: 'Jižní Amerika', flag: '🌎', aliases: ['jizni amerika', 'latinska amerika', 'south america'], cont: 'Jižní Amerika',
    sweep: ['BR', 'AR', 'PE', 'CO', 'CL', 'EC', 'BO', 'UY'] },
  { key: 'oceania', cs: 'Austrálie a Oceánie', flag: '🦘', aliases: ['oceanie', 'australie a oceanie', 'oceania', 'tichomori'], cont: 'Oceánie',
    sweep: ['AU', 'NZ', 'FJ', 'PF'] },
  { key: 'europe', cs: 'Evropa', flag: '🇪🇺', aliases: ['evropa', 'europe'], cont: 'Evropa',
    sweep: ['ES', 'IT', 'GR', 'PT', 'FR', 'HR', 'GB', 'TR', 'CY', 'MT', 'NO', 'IS', 'IE', 'NL', 'ME', 'AL', 'BG'] },
];
export const CONTINENT_BY_KEY = new Map(CONTINENTS.map((c) => [c.key, c]));

const known = new Set(COUNTRIES.map((c) => c.iso2));
/** Země světadílu (kódy ISO), nejdřív ty oblíbené. */
export function continentCountries(key) {
  const c = CONTINENT_BY_KEY.get(key);
  if (!c) return [];
  const all = c.list || COUNTRIES.filter((x) => x.cont === c.cont).map((x) => x.iso2);
  return [...new Set([...c.sweep, ...all])].filter((cc) => known.has(cc));
}

// „Kamkoliv“: kromě Evropy i nejhledanější dálkové země.
export const LONG_HAUL_SWEEP = ['AE', 'TH', 'EG', 'MA', 'US', 'JP', 'MX', 'KE'];

// „Kamkoliv za teplem“: kandidáti v pořadí oblíbenosti (blízké napřed); prohledají se jen ty,
// kde je v měsících odletu aspoň jedno velké letiště dost teplé (viz climate.js).
export const WARM_SWEEP = ['ES', 'PT', 'GR', 'IT', 'HR', 'CY', 'MT', 'TR', 'ME', 'AL', 'BG', 'FR', 'EG', 'MA', 'TN', 'CV',
  'AE', 'OM', 'JO', 'IL', 'QA', 'TH', 'MX', 'DO', 'LK', 'MV', 'ID', 'VN', 'KE', 'TZ', 'CU', 'IN', 'MY', 'PH', 'MU', 'SC',
  'JM', 'CR', 'BR', 'US', 'SG', 'ZA', 'AU'];

// Hlavní letiště dálkových zemí (Travelpayouts vrací ceny z cache hledání ke konkrétnímu cíli
// výrazně spolehlivěji než „odkudkoliv kamkoliv“). Ostatní země: 2 velká letiště z databáze.
const HUBS = {
  AE: ['DXB', 'AUH'], QA: ['DOH'], OM: ['MCT'], JO: ['AMM'], IL: ['TLV'], SA: ['JED', 'RUH'], BH: ['BAH'], LB: ['BEY'],
  IN: ['DEL', 'BOM', 'GOI'], LK: ['CMB'], MV: ['MLE'], NP: ['KTM'], MU: ['MRU'], SC: ['SEZ'],
  TH: ['BKK', 'HKT'], VN: ['SGN', 'HAN'], ID: ['DPS', 'CGK'], MY: ['KUL'], SG: ['SIN'], PH: ['MNL'],
  JP: ['NRT', 'KIX'], KR: ['ICN'], CN: ['PEK', 'PVG'], HK: ['HKG'], TW: ['TPE'],
  EG: ['HRG', 'CAI', 'SSH'], MA: ['RAK', 'AGA', 'CMN'], TN: ['DJE', 'TUN'], CV: ['SID', 'BVC'],
  KE: ['NBO', 'MBA'], TZ: ['ZNZ', 'DAR', 'JRO'], ET: ['ADD'], ZA: ['CPT', 'JNB'], NA: ['WDH'], SN: ['DSS'], GH: ['ACC'],
  NG: ['LOS'], RW: ['KGL'], UG: ['EBB'], MG: ['TNR'],
  US: ['JFK', 'MIA', 'LAX'], CA: ['YYZ', 'YVR'], MX: ['CUN', 'MEX'], DO: ['PUJ', 'SDQ'], CU: ['HAV', 'VRA'], JM: ['MBJ'],
  CR: ['SJO'], PA: ['PTY'], BS: ['NAS'], BB: ['BGI'], GT: ['GUA'],
  BR: ['GRU', 'GIG'], AR: ['EZE'], PE: ['LIM'], CO: ['BOG'], CL: ['SCL'], EC: ['UIO'], BO: ['VVI'], UY: ['MVD'],
  AU: ['SYD', 'MEL'], NZ: ['AKL'], FJ: ['NAN'], PF: ['PPT'],
};
export function hubsOf(cc, max = 2) {
  const list = (HUBS[cc] || airportsInCountry(cc).filter((a) => a.type === 'L').map((a) => a.iata)).filter((x) => getAirport(x));
  return list.slice(0, max);
}

// Velká evropská přestupní letiště s dálkovými spoji.
const HUB_ORIGINS = ['VIE', 'MUC', 'BER', 'FRA', 'BUD', 'WAW', 'ZRH', 'AMS', 'CDG', 'IST', 'MXP', 'FCO', 'MAD', 'BCN', 'LIS',
  'DUS', 'HAM', 'CPH', 'ARN', 'HEL', 'ATH', 'OTP', 'BRU', 'LHR', 'MAN', 'DUB', 'OSL', 'GVA'];

export const FAR_KM = 2500;

/**
 * Přestupní letiště do `maxKm` od domova, která ještě nejsou mezi odletovými (nejbližší první).
 * Vrací stejný tvar jako resolveOrigins: { iata, distKm, ground, hub: true }.
 */
export function hubsNear(home, existing, { kmRate = 1.1, maxKm = 450, max = 3, exclude = [] } = {}) {
  if (!home) return [];
  return HUB_ORIGINS
    .filter((iata) => !existing.has(iata) && !exclude.includes(iata))
    .map((iata) => {
      const a = getAirport(iata);
      return a ? { iata, distKm: Math.round(haversineKm(home.lat, home.lon, a.lat, a.lon)) } : null;
    })
    .filter((x) => x && x.distKm <= maxKm)
    .sort((x, y) => x.distKm - y.distKm)
    .slice(0, max)
    .map((x) => ({ ...x, ground: groundEstimate(x.distKm, kmRate), hub: true }));
}

/** Je letiště / země daleko od domova (dálkový let)? */
export function farAirport(home, iata) {
  const a = getAirport(iata);
  return Boolean(home && a && haversineKm(home.lat, home.lon, a.lat, a.lon) > FAR_KM);
}
export function farCountry(home, cc) {
  const a = hubsOf(cc, 1)[0] || airportsInCountry(cc)[0]?.iata;
  return Boolean(a && farAirport(home, a));
}
