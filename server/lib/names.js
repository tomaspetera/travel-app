// České názvy měst, metropolitní oblasti a turistické regiony.
// Klíče CITY_CS odpovídají názvům měst v data/airports.json (OpenFlights).

export const CITY_CS = {
  Vienna: 'Vídeň', Prague: 'Praha', Munich: 'Mnichov', Nuremberg: 'Norimberk', Dresden: 'Drážďany',
  Leipzig: 'Lipsko', Berlin: 'Berlín', Hamburg: 'Hamburk', Cologne: 'Kolín nad Rýnem', Bremen: 'Brémy',
  Basel: 'Basilej', Zurich: 'Curych', Geneva: 'Ženeva', Salzburg: 'Salcburk', Linz: 'Linec',
  Graz: 'Štýrský Hradec', Klagenfurt: 'Klagenfurt', Kosice: 'Košice', Budapest: 'Budapešť',
  Krakow: 'Krakov', Katowice: 'Katovice', Wroclaw: 'Vratislav', Warsaw: 'Varšava', Gdansk: 'Gdaňsk',
  Poznan: 'Poznaň', Lodz: 'Lodž', London: 'Londýn', Paris: 'Paříž', Rome: 'Řím', Milan: 'Milán',
  Venice: 'Benátky', Naples: 'Neapol', Florence: 'Florencie', Bologna: 'Boloňa', Turin: 'Turín',
  Genoa: 'Janov', Trieste: 'Terst', Seville: 'Sevilla', Valencia: 'Valencie', Lisbon: 'Lisabon',
  Athens: 'Atény', Thessaloniki: 'Soluň', Heraklion: 'Heraklion (Kréta)', Chania: 'Chania (Kréta)',
  Corfu: 'Korfu', Kerkyra: 'Korfu', Larnaca: 'Larnaka', Paphos: 'Pafos', Zagreb: 'Záhřeb',
  Ljubljana: 'Lublaň', Belgrade: 'Bělehrad', Bucharest: 'Bukurešť', 'Cluj-napoca': 'Kluž',
  Brussels: 'Brusel', Copenhagen: 'Kodaň', Kiev: 'Kyjev', Lviv: 'Lvov', Chisinau: 'Kišiněv',
  Marrakech: 'Marrákeš', Tangier: 'Tanger', Cairo: 'Káhira', Amman: 'Ammán', Dubai: 'Dubaj',
  Muscat: 'Maskat', Singapore: 'Singapur', Tokyo: 'Tokio', Seoul: 'Soul', Beijing: 'Peking',
  Shanghai: 'Šanghaj', 'Hong Kong': 'Hongkong', Delhi: 'Dillí', 'New Delhi': 'Dillí', Mumbai: 'Bombaj',
  'Ho Chi Minh City': 'Ho Či Minovo Město', 'Mexico City': 'Ciudad de México', 'Cape Town': 'Kapské Město',
  Mallorca: 'Mallorca', 'Palma de Mallorca': 'Palma de Mallorca', Gerona: 'Girona', Tenerife: 'Tenerife',
  'Gran Canaria': 'Gran Canaria', Arrecife: 'Lanzarote', Funchal: 'Madeira', Malta: 'Malta',
  Copenhague: 'Kodaň', Oporto: 'Porto', Strasbourg: 'Štrasburk', Lyon: 'Lyon', Nice: 'Nice',
  Marseille: 'Marseille', Bordeaux: 'Bordeaux', Toulouse: 'Toulouse', Antwerp: 'Antverpy',
  Gothenburg: 'Göteborg', 'St. Petersburg': 'Petrohrad', Moscow: 'Moskva', Istanbul: 'Istanbul',
  Jerusalem: 'Jeruzalém', 'Tel-aviv': 'Tel Aviv', Havana: 'Havana', Washington: 'Washington',
  Edinburgh: 'Edinburgh', Reykjavik: 'Reykjavík', Riga: 'Riga', Tallinn: 'Tallinn', Vilnius: 'Vilnius',
  Sofia: 'Sofie', Tirana: 'Tirana', Podgorica: 'Podgorica', Skopje: 'Skopje', Sarajevo: 'Sarajevo',
  Bari: 'Bari', Palermo: 'Palermo', Catania: 'Catania', Cagliari: 'Cagliari', Pisa: 'Pisa',
  Bergamo: 'Bergamo', Treviso: 'Treviso', Beauvais: 'Beauvais', Charleroi: 'Charleroi',
};

// Český název města/destinace podle IATA kódu letiště (má přednost před CITY_CS).
export const AIRPORT_CITY_CS = {
  PRG: 'Praha', BRQ: 'Brno', OSR: 'Ostrava', PED: 'Pardubice', KLV: 'Karlovy Vary', BTS: 'Bratislava',
  KSC: 'Košice', TAT: 'Poprad', VIE: 'Vídeň', LNZ: 'Linec', GRZ: 'Štýrský Hradec', SZG: 'Salcburk',
  INN: 'Innsbruck', KLU: 'Klagenfurt', BER: 'Berlín', MUC: 'Mnichov', NUE: 'Norimberk', DRS: 'Drážďany',
  LEJ: 'Lipsko', FRA: 'Frankfurt', HHN: 'Frankfurt-Hahn', HAM: 'Hamburk', CGN: 'Kolín nad Rýnem', DUS: 'Düsseldorf',
  NRN: 'Weeze', DTM: 'Dortmund', STR: 'Stuttgart', FMM: 'Memmingen (Mnichov)', HAJ: 'Hannover', BRE: 'Brémy',
  FKB: 'Karlsruhe/Baden-Baden', FDH: 'Friedrichshafen', PAD: 'Paderborn', LBC: 'Lübeck', SCN: 'Saarbrücken', ERF: 'Erfurt',
  WAW: 'Varšava', WMI: 'Varšava-Modlin', KRK: 'Krakov', KTW: 'Katovice', WRO: 'Vratislav', GDN: 'Gdaňsk',
  POZ: 'Poznaň', LCJ: 'Lodž', RZE: 'Řešov', SZZ: 'Štětín', LUZ: 'Lublin', BZG: 'Bydhošť',
  IEG: 'Zelená Hora', BUD: 'Budapešť', DEB: 'Debrecín', ZRH: 'Curych', GVA: 'Ženeva', BSL: 'Basilej',
  BRN: 'Bern', FCO: 'Řím', CIA: 'Řím-Ciampino', MXP: 'Milán', LIN: 'Milán-Linate', BGY: 'Milán-Bergamo',
  VCE: 'Benátky', TSF: 'Benátky-Treviso', NAP: 'Neapol', FLR: 'Florencie', PSA: 'Pisa', BLQ: 'Boloňa',
  TRN: 'Turín', GOA: 'Janov', TRS: 'Terst', VRN: 'Verona', BRI: 'Bari', BDS: 'Brindisi',
  PMO: 'Palermo', CTA: 'Catania', TPS: 'Trapani', CAG: 'Cagliari', OLB: 'Olbia', AHO: 'Alghero',
  PSR: 'Pescara', AOI: 'Ancona', CIY: 'Comiso', SUF: 'Lamezia Terme', REG: 'Reggio Calabria', RMI: 'Rimini',
  PEG: 'Perugia', CUF: 'Cuneo', BCN: 'Barcelona', GRO: 'Barcelona-Girona', REU: 'Barcelona-Reus', MAD: 'Madrid',
  SVQ: 'Sevilla', VLC: 'Valencie', AGP: 'Málaga', ALC: 'Alicante', PMI: 'Mallorca', IBZ: 'Ibiza',
  MAH: 'Menorca', TFS: 'Tenerife (jih)', TFN: 'Tenerife (sever)', LPA: 'Gran Canaria', ACE: 'Lanzarote', FUE: 'Fuerteventura',
  SPC: 'La Palma', BIO: 'Bilbao', SDR: 'Santander', SCQ: 'Santiago de Compostela', VGO: 'Vigo', OVD: 'Asturie',
  GRX: 'Granada', XRY: 'Jerez', RMU: 'Murcia', ZAZ: 'Zaragoza', LEI: 'Almería', VLL: 'Valladolid',
  LIS: 'Lisabon', OPO: 'Porto', FAO: 'Faro (Algarve)', FNC: 'Madeira', PDL: 'Azory (Ponta Delgada)', TER: 'Azory (Terceira)',
  CDG: 'Paříž', ORY: 'Paříž-Orly', BVA: 'Paříž-Beauvais', NCE: 'Nice', MRS: 'Marseille', LYS: 'Lyon',
  TLS: 'Toulouse', BOD: 'Bordeaux', NTE: 'Nantes', BES: 'Brest', CCF: 'Carcassonne', BZR: 'Béziers',
  FNI: 'Nîmes', PUF: 'Pau', LIL: 'Lille', SXB: 'Štrasburk', MPL: 'Montpellier', BIQ: 'Biarritz',
  AJA: 'Korsika (Ajaccio)', BIA: 'Korsika (Bastia)', PGF: 'Perpignan', LRH: 'La Rochelle', TUF: 'Tours', LIG: 'Limoges',
  EGC: 'Bergerac', RDZ: 'Rodez', DLE: 'Dole', MLH: 'Mylhúzy', EAP: 'Basilej-Mylhúzy', AMS: 'Amsterdam',
  EIN: 'Eindhoven', RTM: 'Rotterdam', MST: 'Maastricht', BRU: 'Brusel', CRL: 'Brusel-Charleroi', ANR: 'Antverpy',
  LGG: 'Lutych', LUX: 'Lucemburk', LHR: 'Londýn-Heathrow', LGW: 'Londýn-Gatwick', STN: 'Londýn-Stansted', LTN: 'Londýn-Luton',
  LCY: 'Londýn-City', SEN: 'Londýn-Southend', MAN: 'Manchester', LPL: 'Liverpool', BHX: 'Birmingham', BRS: 'Bristol',
  EDI: 'Edinburgh', GLA: 'Glasgow', PIK: 'Glasgow-Prestwick', BFS: 'Belfast', NCL: 'Newcastle', LBA: 'Leeds',
  EMA: 'East Midlands', ABZ: 'Aberdeen', DUB: 'Dublin', ORK: 'Cork', SNN: 'Shannon', NOC: 'Knock',
  KIR: 'Kerry', CPH: 'Kodaň', BLL: 'Billund', AAR: 'Aarhus', ARN: 'Stockholm', BMA: 'Stockholm-Bromma',
  NYO: 'Stockholm-Skavsta', VST: 'Stockholm-Västerås', GOT: 'Göteborg', MMX: 'Malmö', OSL: 'Oslo', TRF: 'Oslo-Torp',
  BGO: 'Bergen', TRD: 'Trondheim', SVG: 'Stavanger', HEL: 'Helsinky', TMP: 'Tampere', RVN: 'Rovaniemi (Laponsko)',
  KEF: 'Reykjavík', TOS: 'Tromsø', RIX: 'Riga', TLL: 'Tallinn', VNO: 'Vilnius', KUN: 'Kaunas',
  PLQ: 'Palanga', ZAG: 'Záhřeb', SPU: 'Split', DBV: 'Dubrovník', ZAD: 'Zadar', PUY: 'Pula',
  RJK: 'Rijeka', LJU: 'Lublaň', BEG: 'Bělehrad', INI: 'Niš', SJJ: 'Sarajevo', TZL: 'Tuzla',
  BNX: 'Banja Luka', TGD: 'Podgorica', TIV: 'Tivat', TIA: 'Tirana', SKP: 'Skopje', OHD: 'Ochrid',
  PRN: 'Priština', SOF: 'Sofie', VAR: 'Varna', BOJ: 'Burgas', PDV: 'Plovdiv', OTP: 'Bukurešť',
  BBU: 'Bukurešť-Băneasa', CLJ: 'Kluž', TSR: 'Temešvár', IAS: 'Jasy', SBZ: 'Sibiu', KIV: 'Kišiněv',
  ATH: 'Atény', SKG: 'Soluň', HER: 'Kréta (Heraklion)', CHQ: 'Kréta (Chania)', RHO: 'Rhodos', CFU: 'Korfu',
  KGS: 'Kos', ZTH: 'Zakynthos', JTR: 'Santorini', JMK: 'Mykonos', EFL: 'Kefalonie', PVK: 'Preveza (Lefkada)',
  KLX: 'Kalamata', SMI: 'Samos', MJT: 'Lesbos', JSI: 'Skiathos', LCA: 'Larnaka', PFO: 'Pafos',
  MLA: 'Malta', IST: 'Istanbul', SAW: 'Istanbul-Sabiha', AYT: 'Antalya', DLM: 'Dalaman', BJV: 'Bodrum',
  ADB: 'Izmir', ESB: 'Ankara', GZP: 'Alanya', TLV: 'Tel Aviv', AMM: 'Ammán', AQJ: 'Akaba',
  DXB: 'Dubaj', DWC: 'Dubaj-Al Maktoum', AUH: 'Abú Dhabí', SHJ: 'Šardžá', DOH: 'Dauhá', DIA: 'Dauhá', MCT: 'Maskat',
  BAH: 'Bahrajn', KWI: 'Kuvajt', RUH: 'Rijád', JED: 'Džidda', BEY: 'Bejrút', RKT: 'Ras al-Chajma',
  CAI: 'Káhira', HRG: 'Hurghada', SSH: 'Šarm aš-Šajch', RMF: 'Marsa Alam', RAK: 'Marrákeš', AGA: 'Agadir',
  FEZ: 'Fès', TNG: 'Tanger', CMN: 'Casablanca', RBA: 'Rabat', NDR: 'Nador', ESU: 'Essaouira',
  TUN: 'Tunis', NBE: 'Enfidha (Tunisko)', DJE: 'Džerba', MIR: 'Monastir', ALG: 'Alžír', CPT: 'Kapské Město',
  JNB: 'Johannesburg', NBO: 'Nairobi', MBA: 'Mombasa', ZNZ: 'Zanzibar', JRO: 'Kilimandžáro', DAR: 'Dar es Salaam',
  ADD: 'Addis Abeba', MRU: 'Mauricius', SEZ: 'Seychely', RUN: 'Réunion', SID: 'Kapverdy (Sal)', BVC: 'Kapverdy (Boa Vista)',
  WDH: 'Windhoek', VFA: 'Viktoriiny vodopády', LOS: 'Lagos', ACC: 'Akkra', DSS: 'Dakar', BKK: 'Bangkok',
  DMK: 'Bangkok-Don Mueang', HKT: 'Phuket', CNX: 'Čiang Mai', USM: 'Koh Samui', KBV: 'Krabi', DPS: 'Bali',
  CGK: 'Jakarta', SIN: 'Singapur', KUL: 'Kuala Lumpur', PEN: 'Penang', LGK: 'Langkawi', HAN: 'Hanoj',
  SGN: 'Ho Či Minovo Město', DAD: 'Da Nang', CXR: 'Nha Trang', PQC: 'Phu Quoc', REP: 'Siem Reap', PNH: 'Phnompenh',
  MNL: 'Manila', CEB: 'Cebu', HKG: 'Hongkong', MFM: 'Macao', TPE: 'Tchaj-pej', NRT: 'Tokio-Narita',
  HND: 'Tokio-Haneda', KIX: 'Ósaka', ICN: 'Soul', PEK: 'Peking', PKX: 'Peking-Daxing', PVG: 'Šanghaj',
  DEL: 'Dillí', BOM: 'Bombaj', GOI: 'Goa', GOX: 'Goa', CMB: 'Kolombo', MLE: 'Maledivy',
  KTM: 'Káthmándú', TAS: 'Taškent', SKD: 'Samarkand', ALA: 'Almaty', TBS: 'Tbilisi', KUT: 'Kutaisi',
  BUS: 'Batumi', EVN: 'Jerevan', GYD: 'Baku', JFK: 'New York', EWR: 'New York-Newark', LGA: 'New York-LaGuardia',
  MIA: 'Miami', FLL: 'Fort Lauderdale', MCO: 'Orlando', LAX: 'Los Angeles', SFO: 'San Francisco', LAS: 'Las Vegas',
  ORD: 'Chicago', BOS: 'Boston', IAD: 'Washington', YYZ: 'Toronto', YUL: 'Montréal', YVR: 'Vancouver',
  MEX: 'Ciudad de México', CUN: 'Cancún', HAV: 'Havana', VRA: 'Varadero', PUJ: 'Punta Cana', SDQ: 'Santo Domingo',
  MBJ: 'Jamajka (Montego Bay)', GIG: 'Rio de Janeiro', GRU: 'São Paulo', EZE: 'Buenos Aires', LIM: 'Lima', BOG: 'Bogotá',
  SCL: 'Santiago de Chile', PTY: 'Panama', SJO: 'Kostarika (San José)', UIO: 'Quito', SYD: 'Sydney', MEL: 'Melbourne',
  BNE: 'Brisbane', PER: 'Perth', AKL: 'Auckland', NAN: 'Fidži', PPT: 'Tahiti',
};

// Metropolitní oblasti s více letišti. lat/lon = centrum města (pro výpočet vzdálenosti).
/**
 * Místní a jiné běžné názvy velkých cílů (italsky, německy, portugalsky… i české varianty „Amsterodam“, „Athény“)
 * → metropole (kód METROS) nebo letiště. Bez nich je geokodér najde jinde (Wien v USA, Lisboa v Mosambiku, Roma
 * v Austrálii). Klíče bez diakritiky, malými písmeny.
 */
export const EXONYMS = {
  roma: 'metro:ROM', wien: 'ap:VIE', lisboa: 'ap:LIS', lissabon: 'ap:LIS', napoli: 'ap:NAP',
  firenze: 'ap:FLR', venezia: 'metro:VCE', venedig: 'metro:VCE', milano: 'metro:MIL', mailand: 'metro:MIL',
  torino: 'ap:TRN', genova: 'ap:GOA', amsterodam: 'ap:AMS', atheny: 'ap:ATH', athina: 'ap:ATH', athen: 'ap:ATH',
  munchen: 'ap:MUC', muenchen: 'ap:MUC', koln: 'ap:CGN', koeln: 'ap:CGN', cologne: 'ap:CGN', warszawa: 'metro:WAW',
  krakow: 'ap:KRK', bruxelles: 'metro:BRU', brussel: 'metro:BRU', kobenhavn: 'ap:CPH', nizza: 'ap:NCE', geneve: 'ap:GVA', genf: 'ap:GVA',
  zeneva: 'ap:GVA', beograd: 'ap:BEG', bucuresti: 'metro:BUH',
  // starší a hovorové české názvy (Solnohrad, Inšpruk, Cařihrad, Minorka) a celé české názvy („Frankfurt nad Mohanem“)
  solnohrad: 'ap:SZG', inspruk: 'ap:INN', carihrad: 'metro:IST', 'novy york': 'metro:NYC', 'frankfurt nad mohanem': 'metro:FRA',
  'san francisko': 'ap:SFO', sajgon: 'ap:SGN', minorka: 'ap:MAH', menorka: 'ap:MAH',
};

export const METROS = [
  { code: 'LON', cs: 'Londýn', en: 'London', cc: 'GB', lat: 51.5074, lon: -0.1278, airports: ['LHR', 'LGW', 'STN', 'LTN', 'LCY', 'SEN'] },
  { code: 'PAR', cs: 'Paříž', en: 'Paris', cc: 'FR', lat: 48.8566, lon: 2.3522, airports: ['CDG', 'ORY', 'BVA'] },
  { code: 'MIL', cs: 'Milán', en: 'Milan', cc: 'IT', lat: 45.4642, lon: 9.19, airports: ['MXP', 'LIN', 'BGY'] },
  { code: 'ROM', cs: 'Řím', en: 'Rome', cc: 'IT', lat: 41.9028, lon: 12.4964, airports: ['FCO', 'CIA'] },
  { code: 'VCE', cs: 'Benátky', en: 'Venice', cc: 'IT', lat: 45.4408, lon: 12.3155, airports: ['VCE', 'TSF'] },
  { code: 'BRU', cs: 'Brusel', en: 'Brussels', cc: 'BE', lat: 50.8503, lon: 4.3517, airports: ['BRU', 'CRL'] },
  { code: 'STO', cs: 'Stockholm', en: 'Stockholm', cc: 'SE', lat: 59.3293, lon: 18.0686, airports: ['ARN', 'BMA', 'NYO', 'VST'] },
  { code: 'OSL', cs: 'Oslo', en: 'Oslo', cc: 'NO', lat: 59.9139, lon: 10.7522, airports: ['OSL', 'TRF'] },
  { code: 'WAW', cs: 'Varšava', en: 'Warsaw', cc: 'PL', lat: 52.2297, lon: 21.0122, airports: ['WAW', 'WMI'] },
  { code: 'BCN', cs: 'Barcelona', en: 'Barcelona', cc: 'ES', lat: 41.3874, lon: 2.1686, airports: ['BCN', 'GRO', 'REU'] },
  { code: 'FRA', cs: 'Frankfurt', en: 'Frankfurt', cc: 'DE', lat: 50.1109, lon: 8.6821, airports: ['FRA', 'HHN'] },
  { code: 'IST', cs: 'Istanbul', en: 'Istanbul', cc: 'TR', lat: 41.0082, lon: 28.9784, airports: ['IST', 'SAW'] },
  { code: 'MOW', cs: 'Moskva', en: 'Moscow', cc: 'RU', lat: 55.7558, lon: 37.6173, airports: ['SVO', 'DME', 'VKO'] },
  { code: 'TYO', cs: 'Tokio', en: 'Tokyo', cc: 'JP', lat: 35.6762, lon: 139.6503, airports: ['HND', 'NRT'] },
  { code: 'NYC', cs: 'New York', en: 'New York', cc: 'US', lat: 40.7128, lon: -74.006, airports: ['JFK', 'EWR', 'LGA'] },
  { code: 'WAS', cs: 'Washington', en: 'Washington', cc: 'US', lat: 38.9072, lon: -77.0369, airports: ['IAD', 'DCA', 'BWI'] },
  { code: 'CHI', cs: 'Chicago', en: 'Chicago', cc: 'US', lat: 41.8781, lon: -87.6298, airports: ['ORD', 'MDW'] },
  { code: 'BUH', cs: 'Bukurešť', en: 'Bucharest', cc: 'RO', lat: 44.4268, lon: 26.1025, airports: ['OTP', 'BBU'] },
  { code: 'BKK', cs: 'Bangkok', en: 'Bangkok', cc: 'TH', lat: 13.7563, lon: 100.5018, airports: ['BKK', 'DMK'] },
  { code: 'SEL', cs: 'Soul', en: 'Seoul', cc: 'KR', lat: 37.5665, lon: 126.978, airports: ['ICN', 'GMP'] },
  { code: 'DXB', cs: 'Dubaj', en: 'Dubai', cc: 'AE', lat: 25.2048, lon: 55.2708, airports: ['DXB', 'DWC'] },
  { code: 'TLV', cs: 'Tel Aviv', en: 'Tel Aviv', cc: 'IL', lat: 32.0853, lon: 34.7818, airports: ['TLV'] },
];

// Velká města domova a okolí (pro „Brno – město a letiště v okolí“ i bez geokódování). Poloha = centrum města,
// pop = obyvatel v tisících (jen pro pořadí v našeptávači). Statický seznam – údržba není potřeba.
export const CITIES = [
  ['Praha', 'Prague', 'CZ', 50.0880, 14.4208, 1357], ['Brno', 'Brno', 'CZ', 49.1952, 16.6080, 400], ['Ostrava', 'Ostrava', 'CZ', 49.8347, 18.2820, 280],
  ['Plzeň', 'Pilsen', 'CZ', 49.7475, 13.3776, 185], ['Liberec', 'Liberec', 'CZ', 50.7671, 15.0562, 108], ['Olomouc', 'Olomouc', 'CZ', 49.5955, 17.2518, 102],
  ['České Budějovice', 'Ceske Budejovice', 'CZ', 48.9745, 14.4743, 97], ['Hradec Králové', 'Hradec Kralove', 'CZ', 50.2092, 15.8328, 93],
  ['Ústí nad Labem', 'Usti nad Labem', 'CZ', 50.6607, 14.0323, 92], ['Pardubice', 'Pardubice', 'CZ', 50.0408, 15.7766, 92], ['Zlín', 'Zlin', 'CZ', 49.2265, 17.6707, 74],
  ['Jihlava', 'Jihlava', 'CZ', 49.3961, 15.5912, 54], ['Karlovy Vary', 'Karlovy Vary', 'CZ', 50.2310, 12.8712, 48], ['Opava', 'Opava', 'CZ', 49.9387, 17.9026, 55],
  ['Bratislava', 'Bratislava', 'SK', 48.1482, 17.1067, 475], ['Košice', 'Kosice', 'SK', 48.7144, 21.2580, 230], ['Žilina', 'Zilina', 'SK', 49.2232, 18.7394, 80],
  ['Banská Bystrica', 'Banska Bystrica', 'SK', 48.7358, 19.1462, 76], ['Nitra', 'Nitra', 'SK', 48.3076, 18.0845, 77], ['Poprad', 'Poprad', 'SK', 49.0614, 20.2980, 50],
  ['Vídeň', 'Vienna', 'AT', 48.2085, 16.3721, 2000], ['Linec', 'Linz', 'AT', 48.3069, 14.2858, 210], ['Salcburk', 'Salzburg', 'AT', 47.8095, 13.0550, 155],
  ['Štýrský Hradec', 'Graz', 'AT', 47.0707, 15.4395, 300], ['Katovice', 'Katowice', 'PL', 50.2649, 19.0238, 290], ['Krakov', 'Krakow', 'PL', 50.0614, 19.9366, 800],
  ['Vratislav', 'Wroclaw', 'PL', 51.1079, 17.0385, 670], ['Drážďany', 'Dresden', 'DE', 51.0504, 13.7373, 560], ['Mnichov', 'Munich', 'DE', 48.1374, 11.5755, 1500],
  ['Norimberk', 'Nuremberg', 'DE', 49.4521, 11.0767, 520], ['Budapešť', 'Budapest', 'HU', 47.4979, 19.0402, 1700],
].map(([cs, en, cc, lat, lon, popK]) => ({ cs, en, cc, lat, lon, pop: popK * 1000 }));

// Turistické regiony a ostrovy jako cíl („Kanáry“, „Kréta“ …).
export const REGIONS = [
  { key: 'kanary', cs: 'Kanárské ostrovy', aliases: ['kanary', 'kanarske ostrovy', 'canary islands', 'canaries'], airports: ['TFS', 'TFN', 'LPA', 'ACE', 'FUE', 'SPC'] },
  { key: 'baleary', cs: 'Baleáry', aliases: ['baleary', 'balearske ostrovy', 'balearic islands'], airports: ['PMI', 'IBZ', 'MAH'] },
  { key: 'mallorca', cs: 'Mallorca', aliases: ['mallorca', 'malorka', 'mallorka', 'majorka', 'majorca'], airports: ['PMI'] },
  { key: 'kreta', cs: 'Kréta', aliases: ['kreta', 'crete'], airports: ['HER', 'CHQ'] },
  { key: 'sicilie', cs: 'Sicílie', aliases: ['sicilie', 'sicily', 'sicilia'], airports: ['PMO', 'CTA', 'TPS', 'CIY'] },
  { key: 'sardinie', cs: 'Sardinie', aliases: ['sardinie', 'sardinia', 'sardegna'], airports: ['CAG', 'OLB', 'AHO'] },
  { key: 'madeira', cs: 'Madeira', aliases: ['madeira'], airports: ['FNC'] },
  { key: 'azory', cs: 'Azory', aliases: ['azory', 'azores', 'acores'], airports: ['PDL', 'TER', 'HOR'] },
  { key: 'kypr', cs: 'Kypr', aliases: ['kypr', 'cyprus'], airports: ['LCA', 'PFO'] },
  { key: 'rhodos', cs: 'Rhodos', aliases: ['rhodos', 'rodos', 'rhodes'], airports: ['RHO'] },
  { key: 'korfu', cs: 'Korfu', aliases: ['korfu', 'corfu', 'kerkyra'], airports: ['CFU'] },
  { key: 'zakynthos', cs: 'Zakynthos', aliases: ['zakynthos', 'zante'], airports: ['ZTH'] },
  { key: 'santorini', cs: 'Santorini', aliases: ['santorini', 'thira'], airports: ['JTR'] },
  { key: 'kos', cs: 'Kos', aliases: ['kos'], airports: ['KGS'] },
  // (za řeckými ostrovy: „Kor…“ napřed Korfu, kam se z Česka létá víc)
  { key: 'korsika', cs: 'Korsika', aliases: ['korsika', 'corsica', 'corse'], airports: ['AJA', 'BIA', 'FSC', 'CLY'] },
  { key: 'chorvatske-pobrezi', cs: 'Chorvatské pobřeží', aliases: ['chorvatske pobrezi', 'jadran', 'dalmacie'], airports: ['SPU', 'DBV', 'ZAD', 'PUY', 'RJK'] },
  { key: 'algarve', cs: 'Algarve', aliases: ['algarve'], airports: ['FAO'] },
  { key: 'costa-del-sol', cs: 'Costa del Sol', aliases: ['costa del sol'], airports: ['AGP'] },
  { key: 'bali', cs: 'Bali', aliases: ['bali'], airports: ['DPS'] },
  { key: 'zanzibar', cs: 'Zanzibar', aliases: ['zanzibar'], airports: ['ZNZ'] },
  { key: 'maledivy', cs: 'Maledivy', aliases: ['maledivy', 'maldives'], airports: ['MLE'] },
  { key: 'mauricius', cs: 'Mauricius', aliases: ['mauricius', 'mauritius'], airports: ['MRU'] },
  { key: 'seychely', cs: 'Seychely', aliases: ['seychely', 'seychelles'], airports: ['SEZ'] },
  { key: 'phuket', cs: 'Phuket', aliases: ['phuket'], airports: ['HKT'] },
  { key: 'egypt-more', cs: 'Rudé moře (Egypt)', aliases: ['rude more', 'hurghada', 'sharm', 'egypt more'], airports: ['HRG', 'SSH', 'RMF'] },
  { key: 'turecka-riviera', cs: 'Turecká riviéra', aliases: ['turecka riviera', 'turecko more'], airports: ['AYT', 'DLM', 'BJV', 'GZP'] },
  { key: 'island', cs: 'Island', aliases: ['island', 'iceland'], airports: ['KEF'] },
  // pevninské oblasti (vlajka země místo ostrova)
  { key: 'toskansko', cs: 'Toskánsko', flag: '🇮🇹', aliases: ['toskansko', 'toscana', 'tuscany'], airports: ['FLR', 'PSA'] },
  { key: 'apulie', cs: 'Apulie', flag: '🇮🇹', aliases: ['apulie', 'puglia', 'apulia'], airports: ['BRI', 'BDS'] },
  { key: 'kalabrie', cs: 'Kalábrie', flag: '🇮🇹', aliases: ['kalabrie', 'calabria'], airports: ['SUF', 'REG'] },
  { key: 'amalfi', cs: 'Amalfinské pobřeží', flag: '🇮🇹', aliases: ['amalfi', 'amalfinske pobrezi', 'pobrezi amalfi', 'amalfi coast'], airports: ['NAP'] },
  { key: 'garda', cs: 'Lago di Garda', flag: '🇮🇹', aliases: ['garda', 'lago di garda', 'gardske jezero'], airports: ['VRN', 'BGY'] },
  { key: 'dolomity', cs: 'Dolomity', flag: '🇮🇹', aliases: ['dolomity', 'dolomites', 'dolomiti'], airports: ['VRN', 'BZO', 'INN', 'TSF'] },
  { key: 'dalmacie', cs: 'Dalmácie', flag: '🇭🇷', aliases: ['dalmacie', 'dalmatia', 'dalmacija'], airports: ['SPU', 'ZAD', 'DBV'] },
  { key: 'istrie', cs: 'Istrie', flag: '🇭🇷', aliases: ['istrie', 'istria', 'istra'], airports: ['PUY', 'TRS'] },
  { key: 'azurove-pobrezi', cs: 'Azurové pobřeží', flag: '🇫🇷', aliases: ['azurove pobrezi', 'lazurove pobrezi', 'cote d azur', 'francouzska riviera', 'french riviera'], airports: ['NCE'] },
  { key: 'bulharske-pobrezi', cs: 'Bulharské pobřeží', flag: '🇧🇬', aliases: ['bulharske pobrezi', 'slunecne pobrezi', 'sunny beach', 'zlate pisky', 'golden sands', 'cerne more bulharsko'], airports: ['BOJ', 'VAR'] },
  { key: 'skotsko', cs: 'Skotsko', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', aliases: ['skotsko', 'scotland'], airports: ['EDI', 'GLA', 'ABZ', 'INV'] },
  { key: 'laponsko', cs: 'Laponsko', flag: '🇫🇮', aliases: ['laponsko', 'lapland', 'lappi'], airports: ['RVN', 'KTT'] },
  // geokodér spolkové země do našeptávače nepustí (správní celek) – bez nich „Bavorsko“, „do Tyrolska“ nic nenajdou
  { key: 'bavorsko', cs: 'Bavorsko', flag: '🇩🇪', aliases: ['bavorsko', 'bavaria', 'bayern'], airports: ['MUC', 'NUE', 'FMM'] },
  { key: 'tyrolsko', cs: 'Tyrolsko', flag: '🇦🇹', aliases: ['tyrolsko', 'tyrol'], airports: ['INN'] }, // bez „tirol“ – „Tir…“ je Tirana
];

// Hory, národní parky, jeskyně, skalní města a jezera, kam se jezdí na výlety a na túry – jen pro hledání v Objevuj
// (do návrhů letů nepatří). Geokodér je najde nespolehlivě: Šumava = zastávka autobusu, Jeseníky = směnárna, Pálava =
// Palavas-les-Flots ve Francii, Lipno v Polsku, Königssee = Königsee v Durynsku, Tatry = vesnice v Polsku (živě 10/2026),
// a bez klíče Mapy.com (DEMO) vůbec. Polohy z odpovědí geokodéru (Mapy.com, GeoNames) a z ta-places.js, 10/2026;
// pohoří = střed hlavní turistické oblasti (Jeseníky = Praděd, Beskydy = Radhošť, Malá Fatra = Vrátna dolina, Český ráj =
// Hrubá Skála). kind: range pohoří, park národní park / CHKO, peak hora, cave jeskyně, rocks skalní město / brána, lake jezero
// a přehrada; km = okruh v Objevuj (celá oblast); aliases = jiné názvy a tvary z věty, které Smart.nominatives neodvodí
// („do Krkonoš“, „do Beskyd“, „do Tater“).
export const NATURE = [
  { cs: 'Krkonoše', kind: 'range', sub: 'pohoří a národní park, Sněžka', cc: 'CZ', lat: 50.7672, lon: 15.6222, km: 20, aliases: ['krkonos', 'karkonosze', 'riesengebirge'] },
  { cs: 'Sněžka', kind: 'peak', sub: 'hora 1603 m, Krkonoše', cc: 'CZ', lat: 50.7360, lon: 15.7396, km: 10 },
  { cs: 'Šumava', kind: 'range', sub: 'pohoří a národní park', cc: 'CZ', lat: 48.9769, lon: 13.6331, km: 20, aliases: ['np sumava', 'bohmerwald'] },
  { cs: 'Boubín', kind: 'peak', sub: 'hora 1362 m a prales, Šumava', cc: 'CZ', lat: 48.9913, lon: 13.8175, km: 10, aliases: ['boubinsky prales'] },
  { cs: 'Lipno', kind: 'lake', sub: 'vodní nádrž, Šumava', cc: 'CZ', lat: 48.7018, lon: 14.0626, km: 20, aliases: ['lipenska prehrada', 'vodni nadrz lipno'] },
  { cs: 'Jeseníky', kind: 'range', sub: 'pohoří a CHKO, Praděd', cc: 'CZ', lat: 50.0831, lon: 17.2310, km: 20, aliases: ['hruby jesenik'] },
  { cs: 'Praděd', kind: 'peak', sub: 'hora 1491 m, Jeseníky', cc: 'CZ', lat: 50.0831, lon: 17.2310, km: 10 },
  { cs: 'Beskydy', kind: 'range', sub: 'pohoří a CHKO, Radhošť a Pustevny', cc: 'CZ', lat: 49.4916, lon: 18.2231, km: 20, aliases: ['beskyd', 'moravskoslezske beskydy'] },
  { cs: 'Radhošť', kind: 'peak', sub: 'hora 1129 m, Beskydy', cc: 'CZ', lat: 49.4916, lon: 18.2231, km: 10 },
  { cs: 'Bílé Karpaty', kind: 'range', sub: 'pohoří a CHKO, Velká Javořina', cc: 'CZ', lat: 48.8574, lon: 17.6752, km: 20, aliases: ['bilych karpat'] },
  { cs: 'Pálava', kind: 'park', sub: 'CHKO a vinice, Pavlovské vrchy', cc: 'CZ', lat: 48.8585, lon: 16.6414, km: 10, aliases: ['pavlovske vrchy', 'palavske vrchy'] },
  { cs: 'Moravský kras', kind: 'cave', sub: 'jeskyně a propast Macocha', cc: 'CZ', lat: 49.3732, lon: 16.7298, km: 10 },
  { cs: 'Propast Macocha', kind: 'cave', sub: 'propast, Moravský kras', cc: 'CZ', lat: 49.3732, lon: 16.7298, km: 10, aliases: ['macocha'] },
  { cs: 'Punkevní jeskyně', kind: 'cave', sub: 'jeskyně, Moravský kras', cc: 'CZ', lat: 49.3711, lon: 16.7260, km: 10 },
  { cs: 'České Švýcarsko', kind: 'park', sub: 'národní park, Pravčická brána', cc: 'CZ', lat: 50.8673, lon: 14.3538, km: 20, aliases: ['np ceske svycarsko', 'narodni park ceske svycarsko'] },
  { cs: 'Pravčická brána', kind: 'rocks', sub: 'skalní brána, České Švýcarsko', cc: 'CZ', lat: 50.8839, lon: 14.2816, km: 10 },
  { cs: 'Adršpašsko-teplické skály', kind: 'rocks', sub: 'skalní město', cc: 'CZ', lat: 50.6012, lon: 16.1257, km: 10, aliases: ['adrspach', 'adrspasske skaly', 'teplicke skaly'] },
  { cs: 'Český ráj', kind: 'park', sub: 'CHKO, skalní města a hrady', cc: 'CZ', lat: 50.5452, lon: 15.1947, km: 20 },
  { cs: 'Prachovské skály', kind: 'rocks', sub: 'skalní město, Český ráj', cc: 'CZ', lat: 50.4673, lon: 15.2932, km: 10 },
  { cs: 'Máchovo jezero', kind: 'lake', sub: 'jezero a pláže, Doksy', cc: 'CZ', lat: 50.5835, lon: 14.6498, km: 10 },
  { cs: 'Křivoklátsko', kind: 'park', sub: 'lesy nad Berounkou, hrad Křivoklát', cc: 'CZ', lat: 50.0367, lon: 13.8707, km: 20 },
  { cs: 'Slapská přehrada', kind: 'lake', sub: 'vodní nádrž na Vltavě', cc: 'CZ', lat: 49.7417, lon: 14.3567, km: 20, aliases: ['slapy', 'vodni nadrz slapy'] },
  // v zahraničí
  { cs: 'Dolomity', kind: 'range', sub: 'pohoří, UNESCO', cc: 'IT', lat: 46.3833, lon: 11.8500, km: 20, aliases: ['dolomit', 'dolomites', 'dolomiti'] },
  { cs: 'Vysoké Tatry', kind: 'range', sub: 'pohoří a národní park', cc: 'SK', lat: 49.1382, lon: 20.2193, km: 20, aliases: ['tatry', 'tater', 'vysokych tater', 'tatras'] },
  { cs: 'Malá Fatra', kind: 'park', sub: 'národní park, Vrátna dolina', cc: 'SK', lat: 49.1935, lon: 19.0386, km: 20, aliases: ['vratna dolina'] },
  { cs: 'Slovenský ráj', kind: 'park', sub: 'národní park, Suchá Belá a Sokolia dolina', cc: 'SK', lat: 48.9491, lon: 20.3836, km: 20 },
  { cs: 'Hallstatt', kind: 'lake', sub: 'městečko u Halštatského jezera, Solná komora', cc: 'AT', lat: 47.5622, lon: 13.6487, km: 10, aliases: ['halstatt'] },
  { cs: 'Königssee', kind: 'lake', sub: 'jezero, národní park Berchtesgaden', cc: 'DE', lat: 47.5551, lon: 12.9766, km: 10, aliases: ['koenigssee'] },
  { cs: 'Plitvická jezera', kind: 'park', sub: 'národní park, UNESCO', cc: 'HR', lat: 44.8835, lon: 15.6138, km: 10, aliases: ['plitvice', 'plitvice lakes'] },
];

// Další aliasy zemí (doplňují české názvy z data/countries.json).
export const COUNTRY_ALIASES = {
  cesko: 'CZ', 'ceska republika': 'CZ', cr: 'CZ', cechy: 'CZ', morava: 'CZ', czechia: 'CZ',
  slovensko: 'SK', rakousko: 'AT', nemecko: 'DE', polsko: 'PL', madarsko: 'HU',
  anglie: 'GB', britanie: 'GB', 'velka britanie': 'GB', uk: 'GB', skotsko: 'GB',
  usa: 'US', amerika: 'US', 'spojene staty': 'US', holandsko: 'NL', nizozemsko: 'NL',
  'emiraty': 'AE', 'spojene arabske emiraty': 'AE', sae: 'AE', 'jizni korea': 'KR', korea: 'KR',
  'jizni afrika': 'ZA', jar: 'ZA', dominikana: 'DO',
};

export function cityCs(enCity) {
  return CITY_CS[enCity] || enCity;
}
