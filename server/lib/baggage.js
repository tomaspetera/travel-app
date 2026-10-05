// Příplatky za zavazadla podle dopravce – ODHAD pro férové porovnání cen, ne ceník.
// Typická cena v EUR za osobu a jeden let u nejlevnějšího tarifu (Basic / Light / Saver) při nákupu online
// spolu s letenkou; na letišti bývá 2–3× vyšší. Nízkonákladové aerolinky cenu mění podle trasy, data a doby
// nákupu (Wizz Air 0–122 €, Ryanair 21–60 € za 20 kg), proto je tu reprezentativní střed.
// Stav k 10/2026. Co je v ceně, je čtené ze stránek dopravců o zavazadlech a tarifech; částky jsou z jejich
// ceníků, kde je zveřejňují, jinak střed uváděného rozsahu nebo údaj z druhé ruky.
//
// cabin   = kabinový kufr do ~10 kg (55×40×20 cm); malé zavazadlo pod sedadlo je vždy v ceně
// checked = kufr k odbavení 20–23 kg na letu po Evropě / na krátké trati
// far     = kufr k odbavení na dálkovém letu (chybí = stejně jako checked); kde dopravce dálkovou cenu
//           nezveřejňuje (LOT, TAP, Iberia, BA, Air Europa), je tu hrubých ~70 €
// 0       = v ceně nejlevnějšího tarifu
// group   = dopravci, kteří na jedné letence účtují zavazadlo jednou
// each    = platí se za každý úsek zvlášť (Ryanair, Wizz Air, easyJet, Vueling, Norwegian: přestup jsou
//           dvě letenky nebo se poplatky sčítají); ostatní účtují zavazadlo jednou za celý směr
// est     = hrubý odhad: pravidlo ani částku se u dopravce nepodařilo ověřit
const CARRIERS = [
  // nízkonákladové, Evropa (kabinový kufr jen s Priority / balíčkem)
  { name: 'Ryanair', codes: ['FR', 'RK', 'RR', 'AL', 'LW'], cabin: 24, checked: 35, each: true },
  { name: 'Wizz Air', codes: ['W6', 'W4', 'W9', '5W'], cabin: 28, checked: 40, each: true },
  { name: 'easyJet', codes: ['U2', 'EC', 'DS'], cabin: 25, checked: 32, each: true },
  { name: 'Eurowings', codes: ['EW'], cabin: 24, checked: 30 },
  { name: 'Vueling', codes: ['VY'], cabin: 22, checked: 30, each: true },
  { name: 'Transavia', codes: ['HV', 'TO'], cabin: 20, checked: 40 },
  { name: 'Norwegian', codes: ['DY', 'D8'], cabin: 22, checked: 30, each: true },
  { name: 'Volotea', codes: ['V7'], cabin: 12, checked: 25 },
  { name: 'Jet2', codes: ['LS'], cabin: 0, checked: 25 },
  { name: 'Pegasus', codes: ['PC'], cabin: 25, checked: 30 },
  { name: 'SunExpress', codes: ['XQ'], cabin: 22, checked: 40 },
  { name: 'AJet', codes: ['VF'], cabin: 12, checked: 20 },
  { name: 'Corendon', codes: ['XC', 'XR', 'CD'], cabin: 15, checked: 55, est: true },
  // nízkonákladové, Blízký východ a Asie (7 kg do kabiny v ceně, kufr za příplatek)
  { name: 'Air Arabia', codes: ['G9', '3L', '3O', 'E5'], cabin: 0, checked: 25 },
  { name: 'flydubai', codes: ['FZ'], cabin: 0, checked: 20 },
  { name: 'flynas', codes: ['XY'], cabin: 0, checked: 70 },
  { name: 'Jazeera Airways', codes: ['J9'], cabin: 0, checked: 30 },
  { name: 'SalamAir', codes: ['OV'], cabin: 12, checked: 30 },
  { name: 'Scoot', codes: ['TR'], cabin: 0, checked: 32, far: 63 },
  { name: 'AirAsia', codes: ['AK', 'FD', 'QZ'], cabin: 0, checked: 30 },
  { name: 'AirAsia X', codes: ['D7', 'XJ'], cabin: 0, checked: 45 },
  { name: 'Jetstar', codes: ['JQ', 'GK'], cabin: 0, checked: 31 },
  { name: 'VietJet', codes: ['VJ', 'VZ'], cabin: 0, checked: 23, est: true },
  { name: 'Cebu Pacific', codes: ['5J'], cabin: 0, checked: 22, est: true },
  { name: 'Lion Air', codes: ['SL', 'JT'], cabin: 0, checked: 21, est: true },
  // evropští síťoví dopravci (Basic / Light bez kufru k odbavení, u některých i bez kabinového)
  { name: 'Smartwings', codes: ['QS'], cabin: 0, checked: 40 },
  { name: 'LOT', codes: ['LO'], cabin: 0, checked: 30, far: 70 },
  { name: 'airBaltic', codes: ['BT'], cabin: 20, checked: 35 },
  { name: 'Lufthansa', codes: ['LH'], group: 'LHG', cabin: 20, checked: 40, far: 80 },
  { name: 'Austrian', codes: ['OS'], group: 'LHG', cabin: 20, checked: 40, far: 80 },
  { name: 'SWISS', codes: ['LX'], group: 'LHG', cabin: 20, checked: 40, far: 80 },
  { name: 'Brussels Airlines', codes: ['SN'], group: 'LHG', cabin: 20, checked: 35, far: 80 },
  { name: 'Discover', codes: ['4Y'], group: 'LHG', cabin: 0, checked: 40, far: 80, est: true },
  { name: 'Condor', codes: ['DE'], cabin: 20, checked: 35, far: 65 },
  { name: 'KLM', codes: ['KL'], group: 'AFKL', cabin: 20, checked: 40, far: 80 },
  { name: 'Air France', codes: ['AF'], group: 'AFKL', cabin: 20, checked: 40, far: 80 },
  { name: 'Finnair', codes: ['AY'], cabin: 20, checked: 40, far: 75 },
  { name: 'SAS', codes: ['SK'], cabin: 16, checked: 30, far: 70 },
  { name: 'Aegean', codes: ['A3', 'OA'], cabin: 0, checked: 30 },
  { name: 'ITA Airways', codes: ['AZ'], cabin: 0, checked: 70 },
  { name: 'TAP', codes: ['TP'], cabin: 0, checked: 35, far: 70 },
  { name: 'Iberia', codes: ['IB'], group: 'IB', cabin: 0, checked: 30, far: 70 },
  { name: 'Iberia Express', codes: ['I2'], group: 'IB', cabin: 0, checked: 20 },
  { name: 'British Airways', codes: ['BA'], cabin: 0, checked: 50, far: 70 },
  { name: 'Air Europa', codes: ['UX'], cabin: 0, checked: 35, far: 70 },
  { name: 'Air Serbia', codes: ['JU'], cabin: 0, checked: 60 },
  { name: 'Croatia Airlines', codes: ['OU'], cabin: 0, checked: 30 },
  { name: 'Icelandair', codes: ['FI'], cabin: 0, checked: 55 },
  { name: 'SKY express', codes: ['GQ'], cabin: 0, checked: 28 },
  { name: 'Binter', codes: ['NT'], cabin: 0, checked: 25 },
  { name: 'Neos', codes: ['NO'], cabin: 0, checked: 75 },
  { name: 'Edelweiss', codes: ['WK'], cabin: 0, checked: 50 },
  { name: 'Aer Lingus', codes: ['EI'], cabin: 0, checked: 35, far: 70, est: true },
  { name: 'Virgin Atlantic', codes: ['VS'], cabin: 0, checked: 70, est: true },
  { name: 'Norse Atlantic', codes: ['N0'], cabin: 0, checked: 70, est: true },
  // Severní Amerika: Basic Economy přes Atlantik bez kufru k odbavení
  { name: 'American Airlines', codes: ['AA'], cabin: 0, checked: 74 },
  { name: 'Air Canada', codes: ['AC'], cabin: 0, checked: 60 },
  { name: 'United', codes: ['UA'], cabin: 0, checked: 70 },
  { name: 'Delta', codes: ['DL'], cabin: 0, checked: 70, est: true },
  { name: 'JetBlue', codes: ['B6'], cabin: 0, checked: 70, est: true },
  // po Evropě se kufr platí, na dálkovém letu je v ceně
  { name: 'Turkish Airlines', codes: ['TK'], cabin: 0, checked: 30, far: 0 },
  { name: 'Royal Air Maroc', codes: ['AT'], cabin: 0, checked: 35, far: 0 },
  // nejlevnější tarif jen s příručním (cena = rozdíl k tarifu s kufrem)
  { name: 'Etihad', codes: ['EY'], cabin: 0, checked: 40, est: true },
  { name: 'Saudia', codes: ['SV'], cabin: 0, checked: 40, est: true },
  { name: 'Oman Air', codes: ['WY'], cabin: 0, checked: 40, est: true },
  { name: 'Kuwait Airways', codes: ['KU'], cabin: 0, checked: 40, est: true },
  // kufr k odbavení v ceně i v nejlevnějším tarifu
  ...[['Emirates', 'EK'], ['Qatar Airways', 'QR'], ['Thai Airways', 'TG'], ['Singapore Airlines', 'SQ'], ['Cathay Pacific', 'CX'],
    ['ANA', 'NH'], ['Japan Airlines', 'JL'], ['Korean Air', 'KE'], ['Asiana', 'OZ'], ['China Southern', 'CZ'], ['Hainan Airlines', 'HU'],
    ['Vietnam Airlines', 'VN'], ['Malaysia Airlines', 'MH'], ['Air India', 'AI'], ['SriLankan', 'UL'], ['Royal Jordanian', 'RJ'],
    ['EgyptAir', 'MS'], ['Gulf Air', 'GF'], ['IndiGo', '6E']].map(([name, code]) => ({ name, codes: [code], cabin: 0, checked: 0 })),
  ...[['Air China', 'CA'], ['China Eastern', 'MU'], ['Garuda', 'GA'], ['Ethiopian', 'ET'], ['Enter Air', 'E4']]
    .map(([name, code]) => ({ name, codes: [code], cabin: 0, checked: 0, est: true })),
];

// Dopravce, který v tabulce není. Po Evropě dnes nejlevnější tarif kabinový ani odbavený kufr většinou
// neobsahuje; na dálkovém letu jde skoro vždy o síťového dopravce z Asie, Afriky nebo Ameriky
// (evropští a nízkonákladoví v tabulce jsou) a ten mívá obojí v ceně.
const UNKNOWN = { cabin: 20, checked: 35, farCabin: 0, far: 0 };

const BY_CODE = new Map(CARRIERS.flatMap((c) => c.codes.map((code) => [code, c])));
const rowOf = (code) => BY_CODE.get(String(code || '').toUpperCase());

/**
 * Odhad příplatku za zavazadlo u dopravce (kód IATA) na jeden let a osobu.
 * kind: 'cabin' = kabinový kufr, 'checked' = kufr k odbavení (bez kabinového); cokoliv jiného = 0.
 * Vrací { eur, estimated } – estimated = dopravce není v tabulce (výchozí odhad) nebo je jeho řádek jen hrubý odhad (est).
 */
export function bagFeeEur(carrier, kind, { longHaul = false } = {}) {
  if (kind !== 'cabin' && kind !== 'checked') return { eur: 0, estimated: false };
  const known = rowOf(carrier);
  const c = known || UNKNOWN;
  const far = longHaul ? (kind === 'cabin' ? c.farCabin : c.far) : null;
  return { eur: far ?? c[kind], estimated: !known || Boolean(known.est) };
}

/**
 * Příplatek za celý let (leg) i s přestupy. leg.carriers = dopravci jednotlivých úseků: různí dopravci
 * platí každý zvlášť, tentýž (nebo skupina na jedné letence) jednou – kromě dopravců s příznakem each,
 * kteří účtují každý úsek.
 */
export function legBagEur(leg, kind, opts) {
  const codes = leg?.carriers?.length ? leg.carriers : [leg?.carrier];
  const seen = new Set();
  let eur = 0;
  let estimated = false;
  for (const code of codes) {
    const c = rowOf(code);
    const key = c ? c.group || c.name : String(code || '');
    if (seen.has(key) && !c?.each) continue;
    seen.add(key);
    const f = bagFeeEur(code, kind, opts);
    eur += f.eur;
    estimated = estimated || f.estimated;
  }
  return { eur, estimated };
}
