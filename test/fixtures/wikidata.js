// Zkrácené živé řádky Wikidata Query Service (říjen 2026) pro testy – vygenerováno ze skutečných odpovědí
// dotazů aplikace (sparqlNear: místa ve městě a cíle výletů, sparqlUnesco). Položka:
// [QID, název, popis, lat, lon, počet jazykových verzí, typy (P31 a nadtřídy), památková ochrana (P1435), část celku (P361),
//  { cs, en, wv: názvy článků na Wikipedii / Wikivoyage, cc: kód země, ... }]
// UNESCO: [QID, název, lat, lon, číslo památky].

const lit = (v) => ({ type: 'literal', value: String(v) });
const ent = (id) => ({ type: 'uri', value: `http://www.wikidata.org/entity/${id}` });
const wiki = (lang, t) => ({ type: 'uri', value: `https://${lang}.${lang === 'wv' ? 'wikivoyage.org' : 'wikipedia.org'}/wiki/${encodeURIComponent(t.replace(/ /g, '_'))}` });

/** Položky → řádky odpovědi SPARQL (jako z WDQS: víc řádků na položku, typy/ochrana/části po jednom). */
export function bindings(items) {
  return items.flatMap(([id, label, desc, lat, lon, sl, types, her, part, x = {}]) => {
    const n = Math.max(1, types.length, her.length, part.length);
    return Array.from({ length: n }, (_, i) => {
      const b = { item: ent(id), itemLabel: lit(label), lat: lit(lat), lon: lit(lon), sl: lit(sl) };
      if (desc) b.itemDescription = lit(desc);
      if (types[i]) b.type = ent(types[i]);
      if (her[i]) b.her = ent(her[i]);
      if (part[i]) b.part = ent(part[i]);
      if (x.cs) b.cs = wiki('cs', x.cs);
      if (x.en) b.en = wiki('en', x.en);
      if (x.wv) b.wv = { type: 'uri', value: `https://en.wikivoyage.org/wiki/${encodeURIComponent(x.wv.replace(/ /g, '_'))}` };
      if (x.cc) b.cc = lit(x.cc);
      for (const k of ['loc', 'csl', 'csd', 'whs']) if (x[k]) b[k] = lit(x[k]);
      return b;
    });
  });
}
/** Řádky UNESCO → tvar odpovědi sparqlUnesco. */
export const unescoBindings = (items) => items.map(([id, label, lat, lon, whs]) => ({ item: ent(id), itemLabel: lit(label), lat: lit(lat), lon: lit(lon), whs: lit(whs) }));

// Barcelona (41.3874, 2.1686), cíle výletů do 120 km (≥ 45 jazykových verzí, s Wikivoyage)
export const BCN_TRIPS = [
  ["Q7038","Girona","sídlo v autonomním společenství Katalánsko ve Španělsku",41.98333,2.81667,104,["Q11917457","Q2074737","Q33146843"],[],["Q107554316","Q107554330"],{"cs":"Girona","en":"Girona","wv":"Girona","cc":"ES"}],
  ["Q15551","Sitges","sídlo v autonomním společenství Katalánsko ve Španělsku",41.23389,1.80417,62,["Q11917457","Q2074737","Q33146843"],[],[],{"cs":"Sitges","en":"Sitges","wv":"Sitges","cc":"ES"}],
  ["Q1228808","La Granada","municipality of Spain",41.37724,1.71991,45,["Q11917457","Q33146843","Q2074737"],["Q28034408"],["Q107554312"],{"en":"La Granada","cc":"ES"}],
  ["Q11227","Avinyonet de Puigventós","municipality in the comarca of Alt Empordà, Girona, Catalonia, Spain",42.25046,2.91202,45,["Q11917457","Q2074737","Q33146843"],["Q28034408"],[],{"en":"Avinyonet de Puigventós","cc":"ES"}],
  ["Q16704","Monistrol de Montserrat","obec v Katalánsku ve Španělsku",41.60944,1.84194,49,["Q11917457","Q33146843","Q2074737"],[],[],{"en":"Monistrol de Montserrat","cc":"ES"}],
  ["Q732115","Montserrat","hora ve Španělsku",41.60538,1.8115,46,["Q106589819","Q35145263","Q8502"],[],[],{"cs":"Montserrat (hora)","en":"Montserrat (mountain)","wv":"Montserrat (Spain)","cc":"ES"}],
  ["Q12977","Lloret de Mar","sídlo v autonomním společenství Katalánsko ve Španělsku",41.7,2.83333,64,["Q11917457","Q2074737","Q33146843"],["Q23712"],["Q107554316"],{"cs":"Lloret de Mar","en":"Lloret de Mar","wv":"Lloret de Mar","cc":"ES"}],
  ["Q12586","Besalú","town in the comarca of Garrotxa, in Girona, Catalonia, Spain",42.19893,2.69856,54,["Q11917457","Q2074737","Q33146843"],["Q23712","Q1019352"],[],{"cs":"Besalú","en":"Besalú","wv":"Besalú","cc":"ES"}],
  ["Q15088","Tarragona","sídlo v autonomním společenství Katalánsko ve Španělsku",41.1175,1.25278,112,["Q11917457","Q2074737","Q33146843"],[],["Q107556148"],{"cs":"Tarragona","en":"Tarragona","wv":"Tarragona","cc":"ES"}],
  ["Q645157","Klášter Poblet","monastery in Prades mountains, Catalonia. Spain",41.38083,1.0825,48,["Q132296770","Q132289901","Q160742","Q91315817"],["Q9259","Q23712","Q907116","Q1019352"],[],{"cs":"Klášter Poblet","en":"Poblet Abbey","cc":"ES"}],
];

// Praha (50.08804, 14.42076), cíle výletů do 120 km
export const PRA_TRIPS = [
  ["Q155975","Kutná Hora","město v okrese Kutná Hora ve Středočeském kraji",49.94844,15.26823,74,["Q8452914","Q7930989","Q5153359","Q15978299","Q486972","Q820254","Q14757767","Q3507889","Q2183520","Q699386","Q15284","Q515","Q7819319","Q7841907"],[],[],{"cs":"Kutná Hora","en":"Kutná Hora","wv":"Kutná Hora","cc":"CZ"}],
  ["Q1731","Drážďany","město ve spolkové zemi Sasko v Německu",51.04933,13.73814,183,["Q515","Q1549591","Q13539802","Q262166","Q42744322","Q107104511","Q20724715","Q253030","Q22865","Q61708099"],[],[],{"cs":"Drážďany","en":"Dresden","wv":"Dresden","cc":"DE"}],
  ["Q6462","Dippoldiswalde","velké okresní město ve spolkové zemi Sasko v Německu",50.89333,13.66667,47,["Q1307779","Q262166","Q15974307","Q13539802","Q515","Q42744322","Q134626","Q448801"],[],[],{"cs":"Dippoldiswalde","en":"Dippoldiswalde","cc":"DE"}],
  ["Q14819","Freiberg","město ve spolkové zemi Sasko v Německu",50.91194,13.34278,68,["Q13539802","Q262166","Q515","Q42744322","Q470540","Q134626","Q448801","Q486972","Q820254"],[],[],{"cs":"Freiberg","en":"Freiberg","wv":"Freiberg","cc":"DE"}],
  ["Q165140","Herrnhut","sídlo ve spolkové zemi Sasko v Německu",51.01667,14.74167,59,["Q124250988","Q7930989","Q56061","Q515","Q13539802","Q262166","Q42744322"],[],["Q128009257"],{"cs":"Herrnhut","en":"Herrnhut","wv":"Herrnhut","cc":"DE"}],
  ["Q266698","Karlštejn","hrad v Česku",49.93955,14.18793,50,["Q57821","Q23413"],["Q385405","Q649434","Q1459900"],[],{"cs":"Karlštejn","en":"Karlštejn","cc":"CZ"}],
  ["Q384544","Karlovy Vary","statutární město v okrese Karlovy Vary v Karlovarském kraji",50.23056,12.8725,99,["Q76401672","Q15978299","Q15092400","Q257978","Q14757767","Q3507889","Q2183520","Q699386","Q15284","Q5153359","Q7930989","Q124250988","Q56061","Q515","Q7819319","Q7841907","Q8452914","Q5119","Q12031379"],["Q43113623"],["Q16064866"],{"cs":"Karlovy Vary","en":"Karlovy Vary","wv":"Karlovy Vary","cc":"CZ"}],
  ["Q393426","Žatec","město v okrese Louny v Ústeckém kraji",50.32726,13.54586,49,["Q5153359","Q515","Q7819319","Q7841907","Q14757767","Q3507889","Q2183520","Q699386","Q15284","Q7930989","Q15978299","Q7375052"],["Q1459900"],["Q122898593"],{"cs":"Žatec","en":"Žatec","wv":"Žatec","cc":"CZ"}],
  ["Q436724","Altenberg","město ve spolkové zemi Sasko v Německu",50.76444,13.75778,49,["Q486972","Q820254","Q13539802","Q262166","Q515","Q42744322","Q4946461","Q990488"],[],[],{"cs":"Altenberg","en":"Altenberg, Saxony","cc":"DE"}],
  ["Q57933","Olbernhau","sídlo ve spolkové zemi Sasko v Německu",50.6564,13.34524,46,["Q13539802","Q262166","Q515","Q42744322"],[],[],{"cs":"Olbernhau","en":"Olbernhau","cc":"DE"}],
  ["Q57944","Annaberg-Buchholz","sídlo ve spolkové zemi Sasko v Německu",50.57888,13.01061,62,["Q13539802","Q262166","Q515","Q42744322","Q470540","Q134626","Q448801","Q486972","Q820254","Q140401875"],[],[],{"cs":"Annaberg-Buchholz","en":"Annaberg-Buchholz","cc":"DE"}],
];

// Praha, památky UNESCO v okolí (části sériových mají číslo s pomlčkou)
export const PRA_UNESCO = [
  ["Q1945612","Hornický region Erzgebirge/Krušnohoří",50.4065,12.8373,"1478"],
  ["Q17117941","Historické centrum Kutné Hory s kostelem sv. Barbory a s chrámem Nanebevzetí Panny Marie v Sedlci",49.95,15.2667,"732"],
  ["Q122898593","Žatec a krajina žateckého chmele",50.325,13.5451,"1558-2023"],
  ["Q122898593","Žatec a krajina žateckého chmele",50.3296,13.5445,"1558-2023"],
  ["Q122898593","Žatec a krajina žateckého chmele",50.3206,13.6195,"1558-2023"],
  ["Q20058300","Věž smrti",50.3289,12.9534,"1478-020"],
  ["Q64643977","Historické centrum Kutné Hory s kostelem sv. Barbory",49.9451,15.2637,"732-001"],
  ["Q128009257","Sídla založená moravskými bratry",51.0156,14.7442,"1468bis"],
  ["Q2191998","Kostel Nanebevzetí Panny Marie a svatého Jana Křtitele",49.9598,15.2899,"732-002"],
  ["Q64824434","Freiberg Mining Landscape",50.9183,13.3445,"1478-004"],
  ["Q64824439","Annaberg-Frohnau Mining Landscape",50.5814,12.9926,"1478-008"],
  ["Q64824442","Schneeberg Mining Landscape",50.5957,12.6442,"1478-006"],
  ["Q64824447","Uranium Mining Landscape",50.6334,12.6857,"1478-017"],
  ["Q64824453","Jáchymov Mining Landscape",50.3713,12.9132,"1478-018"],
  ["Q64824456","Hornická kulturní krajina Abertamy-Boží Dar-Horní Blatná",50.4065,12.8373,"1478-019"],
  ["Q64824464","Krupka Mining Landscape",50.6852,13.8555,"1478-021"],
  ["Q64824468","Mědník Hill Mining Landscape",50.4244,13.1116,"1478-022"],
  ["Q57951","Marienberg",50.6508,13.1647,"1478-011"],
  ["Q122898593","Žatec a krajina žateckého chmele",50.325,13.5451,"1558"],
  ["Q122898593","Žatec a krajina žateckého chmele",50.3296,13.5445,"1558"],
  ["Q122898593","Žatec a krajina žateckého chmele",50.3206,13.6195,"1558"],
  ["Q663836","Labské údolí v Drážďanech",51.0498,13.8132,"1156"],
  ["Q66054694","Dippoldiswalde Medieval Silver Mines",50.8967,13.6741,"1478-001"],
  ["Q66054700","Altenberg-Zinnwald Mining Landscape",50.764,13.7705,"1478-002"],
  ["Q66054705","Lauenstein Administrative Centre",50.7853,13.8233,"1478-003"],
  ["Q66054725","Schindlers Werk Smalt Works",50.542,12.6586,"1478-007"],
  ["Q66054735","Pöhlberg Mining Landscape",50.5756,13.0456,"1478-009"],
  ["Q66054740","Buchholz Mining Landscape",50.5631,12.9891,"1478-010"],
  ["Q66054777","Lauta Mining Landscape",50.664,13.1426,"1478-012"],
  ["Q66054780","Ehrenfriedersdorf Mining Landscape",50.6431,12.9767,"1478-013"],
  ["Q66054786","Grünthal Silver-Copper Liquation Works",50.6503,13.3691,"1478-014"],
  ["Q66054796","Rother Berg Mining Landscape",50.5201,12.7876,"1478-016"],
  ["Q393426","Žatec",50.3273,13.5459,"1558-01"],
];

// Barcelona, místa do 10 km (dotaz před doplněním místních názvů)
export const BCN_CITY = [
  ["Q48435","Sagrada Família","chrám ve Španělsku",41.40369,2.17433,109,["Q1088552","Q16970","Q133747929","Q4846867","Q120560"],["Q9259","Q23712","Q1019352"],[],{"cs":"Sagrada Família","en":"Sagrada Família","cc":"ES"}],
  ["Q17155","Katedrála v Barceloně","katedrála ve Španělsku",41.38389,2.17639,44,["Q4846867","Q1088552","Q120560","Q470540","Q2977","Q56242215"],["Q23712","Q1019352"],["Q98690521"],{"cs":"Katedrála v Barceloně","en":"Barcelona Cathedral","cc":"ES"}],
  ["Q212867","Park Güell","významná stavba v Barceloně",41.41361,2.15278,55,["Q7328910","Q1107656","Q860861","Q756102","Q22698","Q1759852","Q111415237","Q35145743","Q13226383","Q338112"],["Q23712","Q1019352","Q15945449","Q43113623"],["Q921745"],{"cs":"Güell (park)","en":"Park Güell","cc":"ES"}],
  ["Q507282","Nemocnice Sant Pau","cultural property in Barcelona, Spain",41.41278,2.17444,37,["Q294422","Q39364723","Q96084375","Q16917","Q64578911"],["Q23712","Q1019352","Q43113623"],["Q16248724","Q64955212"],{"cs":"Nemocnice Sant Pau","en":"Hospital de Sant Pau","cc":"ES"}],
  ["Q17154","Barri Gòtic","historická čtvrť Barcelony",41.38278,2.17694,30,["Q15642541","Q486972","Q123705","Q15642599","Q56061","Q75135432","Q48907157","Q17334923","Q960648","Q82794","Q1200957"],[],[],{"cs":"Barri Gòtic","en":"Gothic Quarter, Barcelona","cc":"ES"}],
  ["Q275715","Estadi Olímpic Lluís Companys","stadion v Barceloně",41.36472,2.15556,41,["Q107640409","Q1049757","Q589481"],["Q11910250"],[],{"cs":"Estadi Olímpic Lluís Companys","en":"Estadi Olímpic Lluís Companys","cc":"ES"}],
  ["Q1333395","Els Quatre Gats","restaurant",41.38578,2.17367,22,["Q83405","Q131734","Q1252971","Q27077054","Q213441","Q11707"],["Q11910250"],[],{"cs":"Els Quatre Gats","en":"Els Quatre Gats","cc":"ES"}],
  ["Q1425790","Hotel Arts","mrakodrap v Barceloně",41.38667,2.19611,21,["Q18142","Q11303","Q48835818","Q655686","Q41176","Q63099748"],["Q28034408"],[],{"cs":"Hotel Arts","en":"Hotel Arts","cc":"ES"}],
  ["Q1286354","Námořní muzeum v Barceloně","muzeum",41.37503,2.17637,16,["Q2516357","Q1863818"],["Q23712"],["Q11955273","Q83618265"],{"cs":"Námořní muzeum v Barceloně","en":"Maritime Museum of Barcelona","cc":"ES"}],
  ["Q337522","La Monumental","bullring in Barcelona, Spain",41.4,2.18111,16,["Q56827005","Q47012103","Q483110","Q174782","Q54831","Q1193438"],["Q11910250"],[],{"en":"La Monumental","cc":"ES"}],
  ["Q2470217","Sagrada Família","human settlement in Eixample, Barcelona, Barcelonès, Spain",41.40356,2.17435,10,["Q48907157","Q15642541","Q486972","Q123705","Q15642599","Q56061","Q75135432"],[],[],{"en":"Sagrada Família (neighborhood)","cc":"ES"}],
];

// Lisabon (38.7223, -9.1393), místa do 10 km
export const LIS_CITY = [
  ["Q272781","Klášter svatého Jeronýma","klášter v Lisabonu",38.69785,-9.2056,53,["Q210272","Q2434238","Q98116669","Q24398318","Q19691007","Q2742167","Q1370598","Q811979","Q486972","Q44613"],["Q9259","Q908411","Q43113623"],["Q15229898"],{"cs":"Klášter jeronymitů","en":"Jerónimos Monastery","cc":"PT"}],
  ["Q2547006","Café A Brasileira (Lisabon)","kavárna v Lisabonu",38.71069,-9.14205,9,["Q210272","Q2434238","Q112654507","Q17334923","Q213441","Q30022"],["Q15697324"],[],{"en":"Café A Brasileira","cc":"PT"}],
  ["Q1636837","Vyšší technický institut","portugalská univerzita",38.73667,-9.13889,9,["Q2434238","Q134301417","Q11908691","Q811430","Q386724","Q811979","Q210272","Q123349660","Q23005223","Q334453","Q38723","Q180958","Q11946645","Q1371037","Q845392","Q118455743"],["Q53806418"],["Q109496576"],{"en":"Instituto Superior Técnico","cc":"PT"}],
  ["Q8843624","Estufa Fria de Lisboa","Gardens in Lisbon, established in 1933",38.7293,-9.1555,10,["Q210272","Q2434238","Q112049379","Q10480682","Q811979","Q315630","Q165044"],["Q53806418"],[],{"en":"Estufa Fria","cc":"PT"}],
  ["Q7875112","Estádio da Luz","potugalský fotbalový stadion v Lisabonu",38.75278,-9.18472,49,["Q210272","Q2434238","Q137884967","Q134497005","Q1076486","Q483110","Q1154710"],["Q66733014"],[],{"cs":"Estádio da Luz","en":"Estádio da Luz","cc":"PT"}],
  ["Q432290","Lisabonská katedrála","Roman Catholic Cathedral located in Lisbon, Portugal",38.70985,-9.13298,32,["Q210272","Q2434238","Q1088552","Q470540","Q2977","Q56242215"],["Q908411"],[],{"cs":"Lisabonská katedrála","en":"Lisbon Cathedral","cc":"PT"}],
  ["Q985517","Alfama","čtvrť v Lisabonu",38.71066,-9.13238,34,["Q210272","Q2434238","Q123705","Q16837104"],["Q66733014"],[],{"cs":"Alfama","en":"Alfama","cc":"PT"}],
  ["Q233737","Most Vasca da Gamy","most v Lisabonu přes řeku Tejo",38.76219,-9.04331,52,["Q210272","Q2434238","Q12280","Q158555","Q537127","Q141503865","Q1411945","Q181348","Q5159064","Q1577013","Q3397516"],["Q66733014"],[],{"cs":"Most Vasca da Gamy","en":"Vasco da Gama Bridge","cc":"PT"}],
];

// Praha (50.0875, 14.4214), místa do 10 km
export const PRA_CITY = [
  ["Q969482","Strahovský klášter","nejstarší český premonstrátský klášter v Praze",50.08596,14.38928,33,["Q132289901","Q98116669","Q24398318","Q2742167","Q1497375","Q1128397","Q16970","Q1509716","Q19691007","Q1370598","Q811979","Q486972","Q44613"],["Q385405","Q649434"],[],{"cs":"Strahovský klášter","en":"Strahov Monastery","cc":"CZ"}],
  ["Q920703","Karolinum","historická budova Univerzity Karlovy v Praze",50.08636,14.42339,12,["Q63341786","Q13226383","Q1497375","Q618123","Q1497364"],["Q385405","Q649434"],[],{"cs":"Karolinum","en":"Karolinum","cc":"CZ"}],
  ["Q724388","Hradčanská radnice","někdejší radnice Hradčan",50.0888,14.3954,7,["Q117863327","Q25550691","Q543654"],["Q385405"],[],{"cs":"Hradčanská radnice","cc":"CZ"}],
  ["Q244816","Tančící dům","moderní bankovní budova na nároží Jiráskova náměstí a Rašínova nábřeží v Praze",50.07556,14.41417,50,["Q41176","Q1021645"],[],[],{"cs":"Tančící dům","en":"Dancing House","cc":"CZ"}],
  ["Q2334312","Obecní dům","secesní koncertní budova v Praze",50.08762,14.42824,21,["Q57660343","Q8719053","Q1060829","Q112654507","Q17334923","Q213441","Q30022"],["Q385405","Q649434"],[],{"cs":"Obecní dům","en":"Municipal House","cc":"CZ"}],
  ["Q1085","Praha","hlavní město Česka",50.0875,14.42139,268,["Q1048835","Q56061","Q192611","Q15042037","Q12357832","Q11618279","Q3507889","Q770948","Q548611","Q17334923","Q960648","Q82794","Q1200957","Q515","Q1549591","Q14757767","Q2183520","Q699386","Q15284","Q5153359","Q7819319","Q7841907","Q8452914","Q41773366","Q10864048","Q691899","Q155076","Q38911","Q5119","Q12031379","Q7930989","Q15978299","Q12055729","Q76007695","Q76009696","Q108178728"],[],[],{"cs":"Praha","en":"Prague","cc":"CZ"}],
  ["Q748211","Staré Město","část hlavního města Prahy",50.0847,14.4203,50,["Q61089180","Q3507889","Q253326","Q20871353","Q115252541","Q486972","Q702492","Q7830048","Q738570","Q123705","Q1468524"],["Q9259"],["Q1085","Q64637410"],{"cs":"Staré Město (Praha)","en":"Old Town (Prague)","cc":"CZ"}],
  ["Q1353687","Velký strahovský stadion","stadion v Praze",50.08034,14.38786,26,["Q483110"],["Q385405"],[],{"cs":"Velký strahovský stadion","en":"Great Strahov Stadium","cc":"CZ"}],
];

// Barcelona, místa do 10 km – dotaz s místními (katalánskými) názvy, českým popisem a číslem UNESCO
export const BCN_LOC = [
  ["Q1414600","Magic Fountain of Montjuïc","fountain in Barcelona, Spain",41.37114,2.15173,24,["Q5522423","Q3370053","Q2736507","Q811979","Q483453"],["Q11910250","Q15945449"],[],{"en":"Magic Fountain of Montjuïc","cc":"ES","loc":"Font Màgica de Montjuïc"}],
  ["Q2288815","Columbus Monument","monument in Barcelona",41.3758,2.17776,24,["Q124336457","Q107338575","Q28870066","Q2293362","Q838948","Q811979","Q4989906"],["Q11910250"],["Q15945449"],{"en":"Columbus Monument, Barcelona","cc":"ES","loc":"Monument a Colom"}],
  ["Q2500125","Montjuïc Castle","cultural property in Barcelona, Spain (European Union)",41.36342,2.16617,17,["Q1019352","Q23712","Q907116","Q16735822","Q2772772","Q4989906","Q1354775","Q5003624","Q57821","Q23413","Q137864285","Q811979","Q178706","Q40357"],["Q23712","Q1019352"],[],{"en":"Montjuïc Castle","cc":"ES","loc":"castell de Montjuïc"}],
  ["Q1519964","Royal Square","square in Barcelona, Spain",41.38,2.175,17,["Q18247357","Q618123","Q1497375","Q816741","Q174782","Q28793904"],["Q11910250"],[],{"en":"Royal Square (Barcelona)","cc":"ES","loc":"Plaça Reial"}],
  ["Q2293331","Basilica of Our Lady of the Pine Tree","cultural property in Barcelona, Spain",41.38222,2.17389,18,["Q4846867","Q1088552","Q120560","Q17334923","Q317557","Q55876909"],["Q23712","Q1019352"],[],{"en":"Santa Maria del Pi, Barcelona","cc":"ES","loc":"Basílica de Santa Maria del Pi"}],
  ["Q301135","parc de la Ciutadella","urban park in Barcelona",41.38811,2.18752,25,["Q14946335","Q1019352","Q384213","Q23712","Q61055883","Q1107656","Q22698","Q22746"],["Q23712","Q1019352"],[],{"en":"Parc de la Ciutadella","cc":"ES","loc":"Parc de la Ciutadella","csl":"parc de la Ciutadella"}],
  ["Q48435","Sagrada Família","chrám ve Španělsku",41.40369,2.17433,109,["Q4846867","Q1088552","Q120560","Q16970","Q133747929"],["Q9259","Q23712","Q1019352"],[],{"cs":"Sagrada Família","en":"Sagrada Família","cc":"ES","loc":"Temple Expiatori de la Sagrada Família","csl":"Sagrada Família","csd":"chrám ve Španělsku"}],
  ["Q212867","Park Güell","významná stavba v Barceloně",41.41361,2.15278,55,["Q111415237","Q35145743","Q13226383","Q338112","Q22698","Q7328910","Q1107656","Q860861","Q756102","Q1759852"],["Q23712","Q1019352","Q15945449","Q43113623"],["Q921745"],{"cs":"Güell (park)","en":"Park Güell","cc":"ES","loc":"Parc Güell","csl":"Park Güell","csd":"významná stavba v Barceloně","whs":"320-001"}],
  ["Q1050032","Museu Picasso","art museum in Barcelona, Spain",41.38522,2.18089,30,["Q24699794","Q33506","Q207694"],[],[],{"en":"Museu Picasso","cc":"ES","loc":"Museu Picasso de Barcelona"}],
  ["Q1334899","La Boqueria","Public market in Barcelona, Spain",41.3818,2.17155,26,["Q18760388","Q330284","Q240854","Q2080521"],["Q112668687"],["Q132969509"],{"en":"La Boqueria","cc":"ES","loc":"Mercat de la Boqueria"}],
  ["Q507282","Nemocnice Sant Pau","cultural property in Barcelona, Spain",41.41278,2.17444,37,["Q39364723","Q96084375","Q16917","Q64578911"],["Q23712","Q1019352","Q43113623"],["Q16248724","Q64955212"],{"cs":"Nemocnice Sant Pau","en":"Hospital de Sant Pau","cc":"ES","loc":"Hospital de la Santa Creu i Sant Pau","csl":"Nemocnice Sant Pau","whs":"804-002"}],
];

// Lisabon, místa do 10 km – dotaz s místními (portugalskými) názvy, českým popisem a číslem UNESCO
export const LIS_LOC = [
  ["Q1549270","Rossio Square","square in Lisbon, Portugal",38.71389,-9.13944,18,["Q811979","Q83620","Q174782","Q111415237","Q2221906","Q2015628"],[],[],{"en":"Rossio","cc":"PT","loc":"Praça de D. Pedro IV"}],
  ["Q1939953","Ribeira Palace","building in Lisbon, Lisbon District, Portugal",38.70684,-9.13704,16,["Q811979","Q41176","Q3947","Q16560","Q96084375","Q19860854"],[],[],{"en":"Ribeira Palace","cc":"PT","loc":"Paço da Ribeira"}],
  ["Q215003","Belémská věž","opevněná věž v Lisabonu",38.69139,-9.21583,57,["Q20034791","Q81917","Q2319498","Q2065736","Q210272","Q811165","Q570116","Q2434238","Q57821","Q1785071"],["Q908411","Q43113623"],["Q15229898"],{"cs":"Belémská věž","en":"Belém Tower","cc":"PT","loc":"Torre de Belém","csl":"Belémská věž","csd":"opevněná věž v Lisabonu","whs":"263bis-002"}],
  ["Q432290","Lisabonská katedrála","Roman Catholic Cathedral located in Lisbon, Portugal",38.70985,-9.13298,32,["Q1088552","Q470540","Q2977","Q56242215","Q2434238","Q210272"],["Q908411"],[],{"cs":"Lisabonská katedrála","en":"Lisbon Cathedral","cc":"PT","loc":"Sé de Lisboa","csl":"Lisabonská katedrála"}],
  ["Q272781","Klášter svatého Jeronýma","klášter v Lisabonu",38.69785,-9.2056,53,["Q98116669","Q24398318","Q19691007","Q2742167","Q1370598","Q811979","Q486972","Q44613","Q2434238","Q210272"],["Q9259","Q908411","Q43113623"],["Q15229898"],{"cs":"Klášter jeronymitů","en":"Jerónimos Monastery","cc":"PT","loc":"Mosteiro dos Jerónimos","csl":"Klášter svatého Jeronýma","csd":"klášter v Lisabonu","whs":"263bis-001"}],
];
