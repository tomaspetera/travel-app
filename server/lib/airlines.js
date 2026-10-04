// Názvy aerolinek podle IATA kódu (pro výsledky z Travelpayouts).
export const AIRLINES = {
  FR: 'Ryanair', RK: 'Ryanair UK', AL: 'Malta Air', RR: 'Buzz', OE: 'Lauda', W6: 'Wizz Air', W4: 'Wizz Air Malta',
  W9: 'Wizz Air UK', '5W': 'Wizz Air Abu Dhabi', U2: 'easyJet', EC: 'easyJet Europe', DS: 'easyJet Switzerland',
  OK: 'Czech Airlines', QS: 'Smartwings', OS: 'Austrian', LH: 'Lufthansa', LX: 'Swiss', KL: 'KLM',
  AF: 'Air France', BA: 'British Airways', TK: 'Turkish Airlines', PC: 'Pegasus', VY: 'Vueling', IB: 'Iberia',
  I2: 'Iberia Express', UX: 'Air Europa', V7: 'Volotea', TP: 'TAP Portugal', LO: 'LOT', SK: 'SAS', AY: 'Finnair',
  A3: 'Aegean', OA: 'Olympic Air', EK: 'Emirates', QR: 'Qatar Airways', EY: 'Etihad', FZ: 'flydubai', LS: 'Jet2',
  TO: 'Transavia France', HV: 'Transavia', EW: 'Eurowings', DE: 'Condor', XQ: 'SunExpress', BT: 'airBaltic',
  JU: 'Air Serbia', RO: 'TAROM', FB: 'Bulgaria Air', OU: 'Croatia Airlines', KM: 'KM Malta Airlines',
  DY: 'Norwegian', D8: 'Norwegian', VS: 'Virgin Atlantic', UA: 'United', DL: 'Delta', AA: 'American Airlines',
  AC: 'Air Canada', ET: 'Ethiopian', MS: 'EgyptAir', SV: 'Saudia', G9: 'Air Arabia', '3O': 'Air Arabia Maroc',
  AT: 'Royal Air Maroc', TU: 'Tunisair', HY: 'Uzbekistan Airways', KC: 'Air Astana', J2: 'AZAL', PS: 'UIA',
  CA: 'Air China', MU: 'China Eastern', CZ: 'China Southern', HU: 'Hainan Airlines', SQ: 'Singapore Airlines',
  TG: 'Thai Airways', VN: 'Vietnam Airlines', NH: 'ANA', JL: 'Japan Airlines', KE: 'Korean Air', OZ: 'Asiana',
  CX: 'Cathay Pacific', MH: 'Malaysia Airlines', GA: 'Garuda', AI: 'Air India', '6E': 'IndiGo', UL: 'SriLankan',
  QF: 'Qantas', NZ: 'Air New Zealand', SN: 'Brussels Airlines', EI: 'Aer Lingus', AZ: 'ITA Airways',
  '4Y': 'Discover', BJ: 'Nouvelair', JP: 'Adria', H4: 'HiSky', '0B': 'Blue Air', NO: 'Neos', WK: 'Edelweiss',
  X3: 'TUIfly', BY: 'TUI', '6B': 'TUIfly Nordic', OR: 'TUI fly NL', TB: 'TUI fly BE', FH: 'Freebird',
  XC: 'Corendon', CAI: 'Corendon', ZB: 'Air Albania', '2B': 'Albawings', B2: 'Belavia', GQ: 'Sky Express',
  KK: 'AtlasGlobal', E4: 'Enter Air', ENT: 'Enter Air', '7W': 'Wind Rose', LG: 'Luxair', WF: 'Widerøe',
  FI: 'Icelandair', OG: 'PLAY', NE: 'Nesma', MM: 'Peach', TR: 'Scoot', AK: 'AirAsia', FD: 'Thai AirAsia',
  VJ: 'VietJet', '5J': 'Cebu Pacific', JQ: 'Jetstar', SL: 'Thai Lion Air', QZ: 'Indonesia AirAsia',
};

export function airlineName(code) {
  return AIRLINES[code] || code || '';
}
