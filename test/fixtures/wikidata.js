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
      for (const k of ['native', 'loc', 'csd']) if (x[k]) b[k] = lit(x[k]);
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
