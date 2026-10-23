// Túry na víc dní v Krkonoších (server/lib/hikeplan.js) – data pro testy bez sítě.
// PEC_PLACES: skutečný výsledek findPlaces kolem Pece pod Sněžkou (50,6917 / 15,7333, okruh 15 km, bez výletů; živě
// Wikidata 23. 10. 2026) zkrácený na [id, název, lat, lon, kategorie, skóre, jazykových verzí, druh přírody, popis].
// TH_SNEZKA: skutečná odpověď trailheadsNear u Sněžky (Wikidata 23. 10. 2026) jako [id, název, druh, lat, lon, verzí].
// BROUTER_PEC_SNEZKA: skutečná odpověď BRouteru (hiking-mountain, Pec → Sněžka → Pec, 23. 10. 2026) – zkrácená:
// každý 7. bod trasy a ze zpráv jen vzdálenost a druh cesty (to čte parseRoute); délka, stoupání a čas beze změny.
// OVERPASS_FOOD: odpověď Overpass ve tvaru jako živá, ale sestavená ručně (z vývojového prostředí Overpass neodpovídal):
// Bouda Růžohorky a Česká poštovna na Sněžce u trasy, restaurace u startu v Peci, Luční bouda mimo trasu, bez názvu.
export const PEC = { lat: 50.6917, lon: 15.7333, label: 'Pec pod Sněžkou' };
export const SNEZKA = { lat: 50.73611, lon: 15.74028 };

/** Řádky PEC_PLACES → místa jako z findPlaces. */
export const places = (rows) => rows.map(([id, name, lat, lon, category, score, sitelinks, natureType, description]) => ({
  id, name, lat, lon, category, score, sitelinks, ...(natureType ? { natureType } : {}), description,
}));
/** Řádky TH_SNEZKA → kandidáti na start túry jako z trailheadsNear. */
export const trailheads = (rows) => rows.map(([id, name, kind, lat, lon, sitelinks]) => ({ id, name, kind, lat, lon, sitelinks }));

export const OVERPASS_FOOD = {
  version: 0.6,
  generator: 'Overpass API (ručně sestavená odpověď pro test)',
  elements: [
    { type: 'node', id: 101, lat: 50.7104, lon: 15.7484, tags: { tourism: 'alpine_hut', name: 'Bouda Růžohorky' } },
    { type: 'node', id: 102, lat: 50.73598, lon: 15.73983, tags: { amenity: 'cafe', name: 'Česká poštovna' } },
    { type: 'node', id: 103, lat: 50.6922, lon: 15.7341, tags: { amenity: 'restaurant', name: 'Restaurace u startu' } },
    { type: 'way', id: 104, center: { lat: 50.7344, lon: 15.6971 }, tags: { tourism: 'alpine_hut', name: 'Luční bouda' } },
    { type: 'node', id: 105, lat: 50.7206, lon: 15.7403, tags: { amenity: 'restaurant' } },
  ],
};

export const PEC_PLACES = [
  ["Q617511","Sněžka",50.73611,15.74028,"nature",58.3,58,"mountain","hora v Krkonoších"],
  ["Q2043817","Krkonošský národní park",50.73611,15.74028,"park",42.5,25,"","národní park v Česku"],
  ["Q621423","Krkonošský národní park",50.76667,15.65,"nature",38.7,25,"park","národní park v Polsku"],
  ["Q1893280","Kostel Wang",50.77739,15.72409,"church",36.4,17,"","stavkirke v Polsku"],
  ["Q1767298","Luční hora",50.7278,15.6825,"nature",35.9,12,"mountain","hora v Krkonoších"],
  ["Q5201559","Svorová hora",50.74278,15.76972,"nature",30.9,9,"mountain","hora v Krkonoších"],
  ["Q3487004","Stříbrný hřbet",50.755,15.67639,"nature",30.7,11,"mountain","hora v Krkonoších"],
  ["Q11757848","Liščí hora",50.6928,15.6889,"nature",30.4,6,"mountain","hora v Krkonoších"],
  ["Q9325939","Růžová hora",50.7206,15.7403,"nature",30.1,6,"mountain","hora v Krkonoších mezi Pecí pod Sněžkou a Sněžkou, přestupní"],
  ["Q11735307","Kaple svatého Vavřince",50.73602,15.73974,"church",29.7,6,"","polská kaple na Sněžce"],
  ["Q200808","Černá hora",50.6525,15.74194,"nature",28.5,6,"mountain","hora v Krkonoších"],
  ["Q3488936","Malý Šišák",50.75944,15.64861,"nature",27.2,10,"mountain","hora na území Špindlerova Mlýna"],
  ["Q573238","Kozí hřbety",50.73389,15.65417,"nature",26.1,7,"mountain","horský hřeben v Krkonoších"],
  ["Q3198841","Kopa",50.74639,15.73,"nature",25.9,6,"mountain","polská hora v Krkonoších"],
  ["Q10857103","Zadní Planina",50.7119,15.6692,"nature",25.3,5,"mountain","hora v Krkonoších"],
  ["Q9213145","Dvorský les",50.6489,15.8636,"nature",24.8,9,"mountain","hora v Krkonoších"],
  ["Q9337581","Tabule",50.75271,15.79155,"nature",23.2,6,"mountain","hora v Krkonoších"],
  ["Q972255","Dívčí kameny",50.7764,15.6022,"nature",23,11,"mountain","hora v Krkonoších"],
  ["Q12056449","Stoh",50.7175,15.6494,"nature",22.9,5,"mountain","hora v Krkonoších"],
  ["Q11812595","Dlouhý hřeben",50.6986,15.8156,"nature",21.5,4,"mountain","hřeben v Krkonoších"],
  ["Q9394964","Lysečinská hora",50.7264,15.8308,"nature",21,5,"mountain","hora v Krkonoších"],
  ["Q2144066","Rennerova bouda",50.7338,15.67481,"ruins",20.9,4,"","zaniklá bouda v Krkonoších"],
  ["Q11832797","Přední planina",50.705,15.6211,"nature",20.8,5,"mountain","hora v Krkonoších"],
  ["Q9334385","Samotnia",50.74905,15.70271,"sight",20.2,4,"","horská chata v polských Krkonoších"],
  ["Q3488142","Smělec",50.77973,15.57871,"nature",19.7,10,"mountain","hora v Krkonoších s vrcholem v Polsku"],
  ["Q11233347","Borowa Góra",50.72907,15.84482,"nature",19.5,5,"mountain","hora na polské straně Krkonoš"],
  ["Q9199574","Čelo",50.7553,15.8128,"nature",19.3,5,"mountain","hora v Krkonoších"],
  ["Q10280423","Železný vrch",50.7375,15.6278,"nature",19.3,5,"mountain","hora v Krkonoších"],
  ["Q11008457","Medvědín",50.7411,15.5825,"nature",19,7,"mountain","hora v Krkonoších"],
  ["Q9363853","Tępy Szczyt",50.7617,15.6583,"nature",18.7,5,"mountain","mountain in Poland"],
  ["Q11823047","Pomezní Boudy",50.74517,15.81996,"sight",18.3,6,"","osada v okrese Trutnov v Královéhradeckém kraji"],
  ["Q3498714","Mužské kameny",50.77694,15.59111,"nature",18,8,"mountain","hora v Krkonoších"],
  ["Q9378021","Wołowa Góra",50.7675,15.8164,"nature",17.4,5,"mountain","hora na polské straně Krkonoš"],
  ["Q9393797","Černá skála",50.7089,15.5656,"nature",17.1,6,"mountain","hora v Krkonoších"],
  ["Q11381695","Čihadlo",50.7636,15.6286,"nature",16.5,5,"mountain","hora na česko-polské hranici v Krkonoších severně od Špindle"],
  ["Q11171441","Čepel",50.6803,15.8635,"nature",16.3,4,"mountain","horská rozsocha v České republice ležící v Krkonoších"],
  ["Q9347762","Sucha Góra",50.77767,15.64718,"nature",15.9,5,"mountain","hora v polské části Krkonoš"],
  ["Q12055852","Stachelberg",50.62783,15.91157,"museum",15.2,5,"","rozestavěná dělostřelecká tvrz u Trutnova"],
  ["Q12029528","Klášter augustiniánů",50.62837,15.60555,"church",15.1,4,"","klášter ve Vrchlabí"],
  ["Q10398509","Šeřín",50.6964,15.5636,"nature",14.8,5,"mountain","hora v Krkonoších"],
  ["Q1011304","Břecštejn",50.58382,15.82826,"castle",14.7,4,"","zřícenina hradu"],
  ["Q1632618","Hrádeček",50.58472,15.8275,"sight",14.3,8,"","vesnice v okrese Trutnov v Královéhradeckém kraji"],
  ["Q11692317","Czoło",50.78984,15.72343,"nature",13.9,4,"mountain",""],
  ["Q11814972","21 Ogrodowa Street in Kowary",50.79787,15.83081,"palace",13.7,4,"","palace in Kowary, Lower Silesian Voivodeship, Poland"],
  ["Q11814934","Palace in Ciszyca",50.8053,15.8133,"palace",13.5,4,"",""],
  ["Q9376270","Podgórna Waterfall",50.80391,15.66847,"nature",12.9,5,"waterfall","waterfall in the Giant Mountains, Poland"],
  ["Q1734234","Petrovy boudy",50.77256,15.61231,"sight",11.6,4,"","horská bouda v Krkonoších"],
  ["Q11772802","Mechové jezírko",50.7402,15.5397,"nature",10.8,5,"lake","ledovcové jezírko v Krkonoších"],
  ["Q9393489","Złoty Widok",50.80685,15.66609,"nature",9.8,4,"mountain","mountain in Poland"],
  ["Q11710099","Horní Mísečky",50.73556,15.57,"sight",7.5,4,"","Horské rekreační středisko v Krkonoších, místní část obce Ví"],
  ["Q11811427","Park miniatur památek Dolního Slezska",50.7986,15.8342,"park",5.5,4,"",""],
];

export const TH_SNEZKA = [
  ["Q63107472","Růžohorky","town",50.71102,15.74996,1],
  ["Q606126","Karpacz","town",50.76667,15.75,45],
  ["Q99701617","Wilcza Poręba","town",50.76553,15.76392,1],
  ["Q98501891","Sagesserovy boudy","town",50.70455,15.77159,1],
  ["Q10510007","Šímovy Chalupy","town",50.7108,15.7875,3],
  ["Q1641742","Pec pod Sněžkou","town",50.69349,15.73325,27],
  ["Q56412456","Pec pod Sněžkou","town",50.69349,15.73325,1],
  ["Q11832789","Płóczki","town",50.78204,15.75289,1],
  ["Q1888051","Malá Úpa","town",50.72386,15.81388,23],
  ["Q659618","Karpacz","station",50.78243,15.76184,4],
  ["Q2512464","Velká Úpa","town",50.68972,15.77111,8],
  ["Q12055768","Spálený Mlýn","town",50.7066,15.8058,1],
  ["Q11823047","Pomezní Boudy","town",50.74517,15.81996,6],
  ["Q12020214","Horní Malá Úpa","town",50.7447,15.8206,5],
  ["Q11816497","Dolní Malá Úpa","town",50.7061,15.8075,5],
  ["Q10857096","Zadní Rennerovky","town",50.6986,15.6672,3],
  ["Q3886723","Ściegny","town",50.79278,15.77778,8],
  ["Q3885070","Borowice","town",50.79258,15.69511,8],
  ["Q98506072","Lučiny","town",50.67006,15.73131,1],
  ["Q12020712","Hrnčířské Boudy","town",50.6695,15.7185,2],
  ["Q3140684","Horní Lysečiny","town",50.6984,15.8306,6],
  ["Q17455055","Friesovy Boudy","town",50.69972,15.64833,1],
];

export const BROUTER_PEC_SNEZKA = {"type":"FeatureCollection","features":[{"type":"Feature","properties":{"track-length":"13863","filtered ascend":"934","total-time":"13950","messages":[["Longitude","Latitude","Elevation","Distance","CostPerKm","ElevCost","TurnCost","NodeCost","InitialCost","WayTags","NodeTags","Time","Energy"],["15733688","50693129","789","148","0","0","0","0","0","highway=path surface=grass","","0","0"],["15732501","50692779","783","93","0","0","0","0","0","reversedirection=yes highway=track surface=compacted tracktype=grade1","","0","0"],["15732481","50692797","782","2","0","0","0","0","0","reversedirection=yes highway=track tracktype=grade1","","0","0"],["15734996","50694377","771","254","0","0","0","0","0","reversedirection=yes highway=footway surface=compacted","","0","0"],["15738902","50695300","762","298","0","0","0","0","0","highway=footway surface=fine_gravel","","0","0"],["15738878","50695406","761","12","0","0","0","0","0","highway=footway surface=wood","","0","0"],["15738877","50695464","761","6","0","0","0","0","0","highway=footway surface=asphalt","","0","0"],["15739161","50695470","760","20","0","0","0","0","0","reversedirection=yes highway=secondary surface=asphalt sidewalk=right route_hiking_rwn=yes route_hiking_lwn=yes","","0","0"],["15738870","50695739","761","37","0","0","0","0","0","highway=residential surface=asphalt route_bicycle_lcn=yes route_hiking_rwn=yes route_hiking_lwn=yes","","0","0"],["15738553","50696191","765","55","0","0","0","0","0","highway=residential surface=asphalt sidewalk=both route_bicycle_lcn=yes route_hiking_rwn=yes route_hiking_lwn=yes","","0","0"],["15738389","50696409","766","27","0","0","0","0","0","highway=residential surface=asphalt sidewalk=both route_bicycle_lcn=yes route_hiking_rwn=yes route_hiking_lwn=yes","","0","0"],["15737585","50697049","771","91","0","0","0","0","0","highway=residential surface=asphalt route_bicycle_lcn=yes route_hiking_rwn=yes route_hiking_lwn=yes","","0","0"],["15738277","50697157","766","50","0","0","0","0","0","highway=service surface=asphalt route_hiking_rwn=yes","","0","0"],["15738426","50697201","766","12","0","0","0","0","0","highway=service surface=concrete route_hiking_rwn=yes","","0","0"],["15738794","50698077","791","118","0","0","0","0","0","highway=service surface=asphalt route_hiking_rwn=yes","","0","0"],["15749863","50710379","1255","2458","0","0","0","0","0","highway=path surface=rock foot=yes bicycle=no route_hiking_rwn=yes","","0","0"],["15750442","50710861","1261","67","0","0","0","0","0","highway=path foot=yes route_hiking_lwn=yes","","0","0"],["15750033","50711549","1265","83","0","0","0","0","0","reversedirection=yes highway=track tracktype=grade1 route_bicycle_lcn=yes route_hiking_lwn=yes","","0","0"],["15747859","50715265","1301","441","0","0","0","0","0","reversedirection=yes highway=track surface=asphalt tracktype=grade1 route_bicycle_lcn=yes route_hiking_lwn=yes","","0","0"],["15745190","50717772","1336","339","0","0","0","0","0","reversedirection=yes highway=track surface=asphalt tracktype=grade1 route_bicycle_lcn=yes route_hiking_lwn=yes","","0","0"],["15744902","50719298","1360","180","0","0","0","0","0","reversedirection=yes highway=footway surface=sett foot=yes bicycle=no route_hiking_lwn=yes","","0","0"],["15741415","50729299","1388","1170","0","0","0","0","0","reversedirection=yes highway=footway surface=sand foot=yes bicycle=no route_hiking_lwn=yes","","0","0"],["15741499","50734842","1562","678","0","0","0","0","0","reversedirection=yes highway=steps surface=rock bicycle=no route_hiking_lwn=yes","","0","0"],["15742039","50735219","1561","58","0","0","0","0","0","reversedirection=yes highway=path surface=cobblestone foot=yes bicycle=no","","0","0"],["15740478","50736504","1591","190","0","0","0","0","0","highway=service surface=sett foot=yes bicycle=no route_hiking_nwn=yes route_hiking_rwn=yes","","0","0"],["15740358","50736206","1598","36","0","0","0","0","0","reversedirection=yes highway=path surface=sett foot=yes bicycle=no route_hiking_nwn=yes route_hiking_rwn=yes","","0","0"],["15740273","50736166","1599","8","0","0","0","0","0","reversedirection=yes highway=path surface=rock foot=yes bicycle=no route_hiking_nwn=yes route_hiking_rwn=yes","","0","0"],["15740358","50736206","1598","9","0","0","0","0","0","highway=path surface=rock foot=yes bicycle=no route_hiking_nwn=yes route_hiking_rwn=yes","","0","0"],["15740478","50736504","1591","36","0","0","0","0","0","highway=path surface=sett foot=yes bicycle=no route_hiking_nwn=yes route_hiking_rwn=yes","","0","0"],["15742039","50735219","1561","190","0","0","0","0","0","reversedirection=yes highway=service surface=sett foot=yes bicycle=no route_hiking_nwn=yes route_hiking_rwn=yes","","0","0"],["15741499","50734842","1562","58","0","0","0","0","0","highway=path surface=cobblestone foot=yes bicycle=no","","0","0"],["15741415","50729299","1388","678","0","0","0","0","0","highway=steps surface=rock bicycle=no route_hiking_lwn=yes","","0","0"],["15744902","50719298","1360","1170","0","0","0","0","0","highway=footway surface=sand foot=yes bicycle=no route_hiking_lwn=yes","","0","0"],["15745190","50717772","1336","180","0","0","0","0","0","highway=footway surface=sett foot=yes bicycle=no route_hiking_lwn=yes","","0","0"],["15747859","50715265","1301","339","0","0","0","0","0","highway=track surface=asphalt tracktype=grade1 route_bicycle_lcn=yes route_hiking_lwn=yes","","0","0"],["15750033","50711549","1265","441","0","0","0","0","0","highway=track surface=asphalt tracktype=grade1 route_bicycle_lcn=yes route_hiking_lwn=yes","","0","0"],["15750442","50710861","1261","83","0","0","0","0","0","highway=track tracktype=grade1 route_bicycle_lcn=yes route_hiking_lwn=yes","","0","0"],["15749863","50710379","1255","67","0","0","0","0","0","reversedirection=yes highway=path foot=yes route_hiking_lwn=yes","","0","0"],["15738794","50698077","791","2458","0","0","0","0","0","reversedirection=yes highway=path surface=rock foot=yes bicycle=no route_hiking_rwn=yes","","0","0"],["15738426","50697201","766","118","0","0","0","0","0","reversedirection=yes highway=service surface=asphalt route_hiking_rwn=yes","","0","0"],["15738277","50697157","766","12","0","0","0","0","0","reversedirection=yes highway=service surface=concrete route_hiking_rwn=yes","","0","0"],["15737585","50697049","771","50","0","0","0","0","0","reversedirection=yes highway=service surface=asphalt route_hiking_rwn=yes","","0","0"],["15738389","50696409","766","91","0","0","0","0","0","reversedirection=yes highway=residential surface=asphalt route_bicycle_lcn=yes route_hiking_rwn=yes route_hiking_lwn=yes","","0","0"],["15738553","50696191","765","27","0","0","0","0","0","reversedirection=yes highway=residential surface=asphalt sidewalk=both route_bicycle_lcn=yes route_hiking_rwn=yes route_hiking_lwn=yes","","0","0"],["15738870","50695739","761","55","0","0","0","0","0","reversedirection=yes highway=residential surface=asphalt sidewalk=both route_bicycle_lcn=yes route_hiking_rwn=yes route_hiking_lwn=yes","","0","0"],["15739161","50695470","760","37","0","0","0","0","0","reversedirection=yes highway=residential surface=asphalt route_bicycle_lcn=yes route_hiking_rwn=yes route_hiking_lwn=yes","","0","0"],["15738877","50695464","761","20","0","0","0","0","0","highway=secondary surface=asphalt sidewalk=right route_hiking_rwn=yes route_hiking_lwn=yes","","0","0"],["15738878","50695406","761","6","0","0","0","0","0","reversedirection=yes highway=footway surface=asphalt","","0","0"],["15738902","50695300","762","12","0","0","0","0","0","reversedirection=yes highway=footway surface=wood","","0","0"],["15734996","50694377","771","298","0","0","0","0","0","reversedirection=yes highway=footway surface=fine_gravel","","0","0"],["15732481","50692797","782","254","0","0","0","0","0","highway=footway surface=compacted","","0","0"],["15732501","50692779","783","2","0","0","0","0","0","highway=track tracktype=grade1","","0","0"],["15733688","50693129","789","93","0","0","0","0","0","highway=track surface=compacted tracktype=grade1","","0","0"],["15733934","50692047","840","148","0","0","0","0","0","reversedirection=yes highway=path surface=grass","","0","0"]]},"geometry":{"type":"LineString","coordinates":[[15.73393,50.69205,840],[15.7335,50.69271,808],[15.7338,50.69307,795],[15.73449,50.694,777],[15.73819,50.69526,763],[15.73899,50.69559,760],[15.73822,50.69657,767],[15.739,50.69753,781],[15.7378,50.70023,833],[15.73778,50.70247,876],[15.73712,50.70423,908],[15.73686,50.70599,941],[15.7373,50.70703,964],[15.73849,50.70629,995],[15.7393,50.70703,1028],[15.74026,50.70824,1056],[15.74435,50.71017,1132],[15.74423,50.70917,1162],[15.74461,50.70859,1177],[15.74581,50.70902,1202],[15.74776,50.70974,1229],[15.74929,50.71021,1250],[15.75042,50.71101,1263],[15.74839,50.71424,1292],[15.74591,50.71711,1323],[15.74487,50.71801,1342],[15.74499,50.7198,1363],[15.74432,50.72261,1367],[15.74309,50.72401,1379],[15.74285,50.72621,1370],[15.74233,50.72703,1362],[15.74142,50.72905,1382],[15.74118,50.72942,1394],[15.74096,50.72983,1405],[15.74067,50.73049,1427],[15.74104,50.73168,1461],[15.74061,50.73222,1482],[15.74136,50.73324,1517],[15.7415,50.73484,1562],[15.74156,50.73573,1572],[15.74048,50.7365,1592],[15.74032,50.73618,1599],[15.74037,50.73631,1597],[15.741,50.73636,1584],[15.74191,50.73514,1562],[15.74164,50.73428,1550],[15.74067,50.73238,1488],[15.74074,50.73181,1468],[15.74097,50.73107,1441],[15.74088,50.73004,1412],[15.74104,50.72955,1398],[15.74141,50.7293,1388],[15.74209,50.72755,1363],[15.7427,50.72656,1366],[15.74274,50.72486,1379],[15.7439,50.72326,1374],[15.74483,50.72153,1361],[15.74477,50.7184,1349],[15.74528,50.71769,1334],[15.7478,50.7154,1302],[15.74994,50.71167,1265],[15.74986,50.71038,1256],[15.74841,50.71015,1242],[15.74631,50.70923,1209],[15.74532,50.70855,1190],[15.74441,50.7089,1169],[15.74436,50.70988,1143],[15.74241,50.70928,1094],[15.73968,50.70755,1041],[15.73904,50.7061,1007],[15.73752,50.70705,971],[15.737,50.70647,952],[15.73663,50.70508,920],[15.73765,50.70324,890],[15.73781,50.70135,853],[15.73797,50.69917,811],[15.73828,50.69716,766],[15.73881,50.69583,763],[15.73889,50.69534,762],[15.73539,50.69454,774],[15.7325,50.69278,783],[15.73354,50.69293,797],[15.73368,50.69244,823],[15.73393,50.69205,840]]}}]};
