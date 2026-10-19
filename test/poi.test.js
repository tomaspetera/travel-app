import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stubFetch } from './helpers.js';
import { findPlaces, findTrips, groupBindings, scorePlace } from '../server/lib/poi.js';

// Tvar odpovědi Wikidata Query Service (application/sparql-results+json).
const lit = (v) => ({ type: 'literal', value: String(v) });
const uri = (v) => ({ type: 'uri', value: v });
const row = (q, label, lat, lon, sl, type, extra = {}) => ({
  item: uri(`http://www.wikidata.org/entity/${q}`), itemLabel: lit(label), lat: lit(lat), lon: lit(lon), sl: lit(sl),
  type: uri(`http://www.wikidata.org/entity/${type}`), ...extra,
});
const CENTER = { lat: 45.4642, lon: 9.19 };
const CITY = [
  row('Q18068', 'Milánská katedrála', 45.4641, 9.1919, 95, 'Q2977', {
    img: uri('http://commons.wikimedia.org/wiki/Special:FilePath/Duomo.jpg'),
    her: uri('http://www.wikidata.org/entity/Q1019'),
    cs: uri('https://cs.wikipedia.org/wiki/Mil%C3%A1nsk%C3%A1_katedr%C3%A1la'),
    en: uri('https://en.wikipedia.org/wiki/Milan_Cathedral'),
  }),
  row('Q18068', 'Milánská katedrála', 45.4641, 9.1919, 95, 'Q16970'),
  row('Q1060', 'Poslední večeře', 45.466, 9.1709, 120, 'Q570116', { her: uri('http://www.wikidata.org/entity/Q9259'), en: uri('https://en.wikipedia.org/wiki/The_Last_Supper_(Leonardo)') }),
  row('Q186434', 'Milano Centrale', 45.4859, 9.2045, 40, 'Q55488'),
  row('Q2', 'Q2', 45.47, 9.19, 10, 'Q33506'),
  row('Q490', 'Milán', 45.4669, 9.19, 200, 'Q515'),
  row('Q5', 'Castello Sforzesco', 45.4705, 9.1793, 60, 'Q23413'),
];
const TRIPS = [
  row('Q6414', 'Como', 45.8081, 9.0852, 110, 'Q747074', { en: uri('https://en.wikipedia.org/wiki/Como') }),
  row('Q6413', 'Bergamo', 45.695, 9.67, 120, 'Q747074'),
  row('Q99', 'Nějaká firma', 45.6, 9.3, 60, 'Q4830453'),
  row('Q1120', 'Katedrála v Comu', 45.8115, 9.0838, 50, 'Q2977', { her: uri('http://www.wikidata.org/entity/Q9259') }),
  row('Q7000', 'Legnano', 45.5956, 8.9142, 70, 'Q747074'), // město bez známých památek
];

test('groupBindings: sloučí řádky, rozpozná kategorie, vyřadí nádraží a položky bez názvu', () => {
  const places = groupBindings(CITY, CENTER);
  const ids = places.map((p) => p.id);
  assert.ok(ids.includes('Q18068') && ids.includes('Q1060') && ids.includes('Q5'));
  assert.ok(!ids.includes('Q186434'), 'nádraží pryč');
  assert.ok(!ids.includes('Q2'), 'bez popisku pryč');
  const duomo = places.find((p) => p.id === 'Q18068');
  assert.equal(duomo.category, 'church');
  assert.equal(duomo.heritage, true);
  assert.equal(duomo.image, 'https://commons.wikimedia.org/wiki/Special:FilePath/Duomo.jpg?width=500');
  const supper = places.find((p) => p.id === 'Q1060');
  assert.equal(supper.unesco, true);
  assert.ok(scorePlace(supper) > scorePlace({ ...supper, unesco: false, heritage: false }));
  assert.equal(places.find((p) => p.id === 'Q490').category, 'town');
});

test('findPlaces: Wikidata + popisy z Wikipedie, výlety mimo město, User-Agent podle pravidel Wikimedie', async () => {
  const stub = stubFetch((url) => {
    if (url.startsWith('https://query.wikidata.org/sparql')) {
      const q = decodeURIComponent(new URL(url).searchParams.get('query'));
      return { body: { results: { bindings: q.includes('"120"') ? TRIPS : q.includes('VALUES ?ft') ? [] : CITY } } };
    }
    if (url.startsWith('https://cs.wikipedia.org/w/api.php')) {
      return { body: { query: { pages: [{ title: 'Milánská katedrála', extract: 'Milánská katedrála je gotická katedrála v Miláně.', thumbnail: { source: 'https://upload.wikimedia.org/duomo-480.jpg' } }] } } };
    }
    if (url.startsWith('https://en.wikipedia.org/w/api.php')) {
      return { body: { query: { normalized: [{ from: 'The_Last_Supper_(Leonardo)', to: 'The Last Supper (Leonardo)' }], pages: [{ title: 'The Last Supper (Leonardo)', extract: 'The Last Supper is a mural painting by Leonardo da Vinci.' }, { title: 'Como', extract: 'Como is a city on Lake Como.' }] } } };
    }
    return { status: 404, body: '{}' };
  });
  try {
    const items = await findPlaces({ lat: CENTER.lat, lon: CENTER.lon, radiusKm: 10 });
    const sparql = stub.calls.filter((c) => c.url.includes('query.wikidata.org'));
    assert.equal(sparql.length, 3, 'město + zoo/parky + výlety');
    assert.equal(sparql.filter((c) => decodeURIComponent(c.url).includes('wd:Q43501')).length, 1, 'zoo a parky zvlášť');
    assert.match(sparql[0].init.headers['User-Agent'], /^ATLAS-travel\/.*github\.com/);
    const duomo = items.find((p) => p.id === 'Q18068');
    assert.equal(duomo.extract, 'Milánská katedrála je gotická katedrála v Miláně.');
    assert.equal(duomo.extractLang, 'cs');
    assert.equal(duomo.image, 'https://upload.wikimedia.org/duomo-480.jpg');
    assert.equal(duomo.categoryLabel, 'Kostel / chrám');
    assert.equal(items.find((p) => p.id === 'Q1060').extractLang, 'en');
    const como = items.find((p) => p.id === 'Q6414');
    assert.equal(como.category, 'daytrip');
    assert.deepEqual(como.highlights, ['Katedrála v Comu'], 'co je ve městě k vidění');
    assert.equal(como.unesco, true, 'UNESCO z památky ve městě');
    assert.ok(!items.some((p) => p.id === 'Q1120'), 'katedrála je součástí výletu do Coma, ne zvlášť');
    const legnano = items.find((p) => p.id === 'Q7000');
    assert.ok(legnano && como.score > legnano.score + 20, 'město s památkou (UNESCO) má přednost před městem bez památek');
    assert.ok(!items.some((p) => p.id === 'Q99'), 'firma není výlet');
    assert.ok(!items.some((p) => p.id === 'Q490'), 'samotné město (v centru) není „místo k návštěvě“');
  } finally {
    stub.restore();
  }
});

test('classifyText: kategorie z popisu, nádraží/ulice/školy pryč', async () => {
  const { classifyText } = await import('../server/lib/poi.js');
  assert.equal(classifyText('gotická katedrála v Miláně'), 'church');
  assert.equal(classifyText('art museum in Lisbon'), 'museum');
  assert.equal(classifyText('railway station in Milan'), null);
  assert.equal(classifyText('ulice v Praze'), null);
  assert.equal(classifyText('square in Kraków'), 'square');
});

test('findPlaces: při výpadku Wikidata SPARQL použije Wikipedia geosearch + počty jazykových verzí', async () => {
  const stub = stubFetch((url) => {
    if (url.startsWith('https://query.wikidata.org/sparql')) return { status: 503, body: 'overloaded' };
    if (url.startsWith('https://www.wikidata.org/w/api.php')) {
      return { body: { query: { pages: [{ title: 'Q1', pageprops: { 'wb-sitelinks': '80' } }, { title: 'Q2', pageprops: { 'wb-sitelinks': '5' } }] } } };
    }
    if (url.includes('wikipedia.org/w/api.php') && url.includes('generator=geosearch')) {
      const cs = url.startsWith('https://cs.');
      return { body: { query: { pages: cs
        ? [{ title: 'Pražský hrad', description: 'hradní komplex v Praze', coordinates: [{ lat: 50.0909, lon: 14.4005 }], pageprops: { wikibase_item: 'Q1' }, thumbnail: { source: 'https://upload.wikimedia.org/hrad.jpg' } },
          { title: 'Praha hlavní nádraží', description: 'železniční stanice v Praze', coordinates: [{ lat: 50.083, lon: 14.435 }], pageprops: { wikibase_item: 'Q3' } }]
        : [{ title: 'Charles Bridge', description: 'bridge in Prague', coordinates: [{ lat: 50.0865, lon: 14.4114 }], pageprops: { wikibase_item: 'Q2' } }] } } };
    }
    if (url.includes('wikipedia.org/w/api.php')) return { body: { query: { pages: [] } } };
    return { status: 404, body: '{}' };
  });
  try {
    const items = await findPlaces({ lat: 50.087, lon: 14.42, radiusKm: 9 });
    const ids = items.map((p) => p.id);
    assert.deepEqual(ids.sort(), ['Q1', 'Q2']);
    const hrad = items.find((p) => p.id === 'Q1');
    assert.equal(hrad.category, 'castle');
    assert.equal(hrad.sitelinks, 80);
    assert.ok(hrad.score > items.find((p) => p.id === 'Q2').score);
  } finally {
    stub.restore();
  }
});

test('Wikivoyage: doporučená místa (see/do) dostanou body a značku, výpadek nevadí', async () => {
  const { parseListings, applyWikivoyage } = await import('../server/lib/poi.js');
  const wt = `== See ==
* {{see
| name=[[Milan Cathedral|Duomo di Milano]] | alt=Duomo | wikidata=Q18068
| content=The {{cathedral|x}} is great.
}}
* {{listing | type=see | name='''Castello Sforzesco''' | wikidata= }}
* {{listing | type=eat | name=Pizzeria Uno }}
* {{do | name=Navigli boat tour }}
* {{sleep | name=Hotel X }}`;
  const ls = parseListings(wt);
  assert.deepEqual(ls.map((l) => l.name), ['Duomo di Milano', 'Castello Sforzesco', 'Navigli boat tour']);
  assert.equal(ls[0].wikidata, 'Q18068');
  const places = applyWikivoyage([
    { id: 'Q18068', name: 'Milánská katedrála', score: 50, category: 'church' },
    { id: 'Q5', name: 'Castello Sforzesco', score: 40, category: 'castle' },
    { id: 'Q9', name: 'Pizzeria Uno', score: 10, category: 'sight' },
  ], ls);
  assert.deepEqual(places.map((p) => [p.id, p.score, Boolean(p.wikivoyage)]), [['Q18068', 58, true], ['Q5', 48, true], ['Q9', 10, false]]);

  // Integrace: findPlaces použije Wikivoyage, když odpoví; když ne, výsledek je stejný bez značek.
  const stub = stubFetch((url) => {
    if (url.startsWith('https://query.wikidata.org/sparql')) {
      const q = decodeURIComponent(new URL(url).searchParams.get('query'));
      return { body: { results: { bindings: q.includes('"120"') ? [] : CITY } } };
    }
    if (url.startsWith('https://en.wikivoyage.org/w/api.php') && url.includes('list=geosearch')) return { body: { query: { geosearch: [{ title: 'Milan' }] } } };
    if (url.startsWith('https://en.wikivoyage.org/w/api.php')) return { body: { query: { pages: [{ title: 'Milan', revisions: [{ slots: { main: { content: wt } } }] }] } } };
    if (url.includes('wikipedia.org/w/api.php')) return { body: { query: { pages: [] } } };
    return { status: 404, body: '{}' };
  });
  try {
    const items = await findPlaces({ lat: 45.4642 + 1e-4, lon: 9.19, radiusKm: 10, dayTrips: false });
    assert.equal(items.find((p) => p.id === 'Q18068').wikivoyage, true);
    assert.ok(!items.find((p) => p.id === 'Q1060').wikivoyage);
    assert.ok(stub.calls.some((c) => c.url.includes('wikivoyage') && c.init.headers['User-Agent'].startsWith('ATLAS-travel/')));
  } finally {
    stub.restore();
  }
});

test('groupBindings: stadion/letiště ani jako památka, stát/událost ne, památková ulice/čtvrť ano, most i když je to silnice', () => {
  const R = (q, label, sl, types, extra = {}) => types.map((t) => row(q, label, 38.71, -9.14, sl, t, extra));
  const her = { her: uri('http://www.wikidata.org/entity/Q1019') };
  const rows = [
    ...R('Q7875112', 'Estádio da Luz', 49, ['Q483110', 'Q1076486', 'Q210272'], her),
    ...R('Q403671', 'Letiště Lisabon', 50, ['Q644371', 'Q1248784', 'Q210272'], her),
    ...R('Q33946', 'Československo', 168, ['Q3024240', 'Q96196009']),
    ...R('Q190271', 'Metro v Praze', 60, ['Q5503']),
    ...R('Q985517', 'Alfama', 34, ['Q123705', 'Q210272'], her),
    ...R('Q1535529', 'Zlatá ulička', 28, ['Q79007'], her),
    ...R('Q244816', 'Tančící dům', 50, ['Q41176', 'Q1021645']),
    ...R('Q204871', 'Karlův most', 62, ['Q12280', 'Q34442', 'Q79007', 'Q811979'], her),
    ...R('Q848072', 'Španělské schody', 40, ['Q12511']),
  ];
  const cat = Object.fromEntries(groupBindings(rows, { lat: 38.7, lon: -9.1 }).map((p) => [p.name, p.category]));
  assert.equal(cat['Estádio da Luz'], undefined);
  assert.equal(cat['Letiště Lisabon'], undefined);
  assert.equal(cat['Československo'], undefined);
  assert.equal(cat['Metro v Praze'], undefined);
  assert.equal(cat.Alfama, 'oldtown');
  assert.equal(cat['Zlatá ulička'], 'sight');
  assert.equal(cat['Tančící dům'], 'sight');
  assert.equal(cat['Karlův most'], 'bridge');
  assert.equal(cat['Španělské schody'], 'sight');
});

// Cíle výletů z Lisabonu: obec/okres/kraj se stejnými souřadnicemi, UNESCO o kus dál od středu,
// části rozsáhlé sériové památky.
const LIS = { lat: 38.7223, lon: -9.1393 };
const desc = (d) => ({ itemDescription: lit(d) });
const NAT = (q, label, lat, lon, sl, t) => ({ item: uri(`http://www.wikidata.org/entity/${q}`), itemLabel: lit(label), lat: lit(lat), lon: lit(lon), sl: lit(sl), t: uri(`http://www.wikidata.org/entity/${t}`) });
const LIS_NATURE = [
  NAT('Q2001', 'Parque Natural de Sintra-Cascais', 38.76, -9.45, 12, 'Q46169'),
  NAT('Q2002', 'Serra da Arrábida', 38.48, -8.98, 20, 'Q8502'),
  NAT('Q2003', 'Gruta de Mira de Aire', 39.54, -8.71, 6, 'Q35509'),
  NAT('Q2004', 'Monsanto', 38.73, -9.19, 15, 'Q8502'), // v okruhu města → ne výlet
];
const LIS_TRIPS = [
  row('Q597', 'Lisabon', 38.7223, -9.1393, 250, 'Q515'),
  row('Q190187', 'Sintra', 38.7974, -9.3904, 72, 'Q515', desc('sídlo v kraji Lisabon v Portugalsku')),
  row('Q1048', 'Palácio da Pena', 38.7876, -9.3906, 60, 'Q16560'),
  row('Q1049', 'palácio da pena', 38.7877, -9.3907, 45, 'Q16560'), // totéž jinak napsané
  row('Q1050', 'Kulturní krajina Sintry s paláci', 38.789, -9.43, 46, 'Q16560'), // delší varianta jména
  row('Q179948', 'Évora', 38.5725, -7.9072, 79, 'Q515', desc('sídlo v kraji Alentejo')),
  row('Q274118', 'Évora', 38.5697, -7.9097, 50, 'Q515', desc('district in Alentejo, Portugal')),
  row('Q26824', 'Alentejo', 38.5667, -7.9, 56, 'Q515', desc('kraj v Portugalsku')),
  row('Q173699', 'Setúbal', 38.5243, -8.8926, 80, 'Q515', desc('sídlo v Portugalsku')),
  row('Q9001', 'Hornické městečko', 39.3, -8.5, 60, 'Q515', desc('městečko')),
];
const whs = (q, label, lat, lon, id) => ({ item: uri(`http://www.wikidata.org/entity/${q}`), itemLabel: lit(label), lat: lit(lat), lon: lit(lon), whs: lit(id) });
const LIS_UNESCO = [
  whs('Q3848197', 'Kulturní krajina Sintry', 38.7883, -9.4338, '723'),
  whs('Q8343770', 'Historické centrum Évory', 38.573, -7.9077, '361'),
  ...[1, 2, 3, 4].map((i) => whs(`Q99${i}`, `Důl ${i}`, 39.3 + i * 0.01, -8.5, `999-00${i}`)),
];

test('findTrips: města podle památek a UNESCO v okolí, bez krajů a okresů, sériové památky jen s malým bonusem', async () => {
  const stub = stubFetch((url) => {
    if (url.startsWith('https://query.wikidata.org/sparql')) {
      const q = decodeURIComponent(new URL(url).searchParams.get('query'));
      return { body: { results: { bindings: q.includes('"120"') ? LIS_TRIPS : q.includes('P757') ? LIS_UNESCO : q.includes('VALUES ?t') && q.includes('Q46169') ? LIS_NATURE : [] } } };
    }
    if (url.includes('wikipedia.org/w/api.php')) return { body: { query: { pages: [] } } };
    return { status: 404, body: '{}' };
  });
  try {
    const trips = await findTrips({ lat: LIS.lat, lon: LIS.lon });
    const ids = trips.map((t) => t.id);
    assert.ok(!ids.includes('Q597'), 'výchozí město není výlet');
    assert.ok(!ids.includes('Q274118') && !ids.includes('Q26824'), 'okres a kraj se souřadnicemi Évory nejsou cíl');
    assert.ok(!ids.includes('Q1048'), 'palác je součástí výletu do Sintry');
    const sintra = trips.find((t) => t.id === 'Q190187');
    assert.equal(sintra.unesco, true, 'UNESCO 4 km od středu města');
    assert.deepEqual(sintra.highlights, ['Kulturní krajina Sintry', 'Palácio da Pena']);
    assert.equal(sintra.categoryLabel, 'Město / obec');
    const setubal = trips.find((t) => t.id === 'Q173699');
    assert.ok(sintra.score > setubal.score + 15, 'památkové město před větším městem bez památek');
    const mining = trips.find((t) => t.id === 'Q9001');
    assert.ok(mining.unescoPart && !mining.unesco, 'část sériové památky');
    assert.ok(mining.score < sintra.score);
    assert.deepEqual(ids, [...trips].sort((a, b) => b.score - a.score).map((t) => t.id), 'seřazeno podle skóre');
    assert.ok(!trips.degraded);
    // přírodní cíle z dotazu podle typu (národní park, hora, jeskyně), ne ty v okruhu města
    const park = trips.find((t) => t.id === 'Q2001');
    assert.equal(park?.tripKind, 'nature');
    assert.equal(park.natureKind, 'park');
    assert.equal(park.categoryLabel, 'Národní park');
    assert.ok(trips.some((t) => t.id === 'Q2003' && t.natureKind === 'cave'));
    assert.ok(!trips.some((t) => t.id === 'Q2004'), 'Monsanto je v Lisabonu');
  } finally {
    stub.restore();
  }
});

test('findTrips: „Část popisů se nenačetla“ jen když opravdu selžou popisy, ne když chybí příroda nebo hrady', async () => {
  const rows = [
    row('Q501', 'Karlovy Vary', 45.6, 7.9, 100, 'Q515', { en: uri('https://en.wikipedia.org/wiki/Karlovy_Vary') }),
    row('Q502', 'Bezčlánkov', 45.5, 7.4, 60, 'Q515'), // bez článku na Wikipedii – to chyba není
  ];
  const run = (lat, lon, wikiStatus) => {
    const stub = stubFetch((url) => {
      if (url.startsWith('https://query.wikidata.org/sparql')) {
        const q = decodeURIComponent(new URL(url).searchParams.get('query'));
        if (q.includes('VALUES ?t')) return { status: 500, body: 'timeout' }; // hrady a příroda nestihly
        return { body: { results: { bindings: q.includes('"120"') ? rows : [] } } };
      }
      if (url.includes('wikipedia.org/w/api.php')) return wikiStatus === 200 ? { body: { query: { pages: [{ title: 'Karlovy Vary', extract: 'Karlovy Vary is a spa town.' }] } } } : { status: wikiStatus, body: 'x' };
      return { body: {} };
    });
    return findTrips({ lat, lon }).finally(() => stub.restore());
  };
  // příroda a hrady chybí → kratší mezipaměť (degraded), ale popisy jsou v pořádku
  const a = await run(45.07, 7.68, 200);
  assert.equal(a.degraded, true);
  assert.ok(!a.descFailed);
  assert.equal(a.find((t) => t.id === 'Q501').extract, 'Karlovy Vary is a spa town.');
  assert.equal(a.find((t) => t.id === 'Q501').descLang, 'en', 'anglický úvod se značkou jazyka');
  // Wikipedie neodpovídá → teprve teď hláška
  const b = await run(45.17, 7.78, 503);
  assert.equal(b.descFailed, true);
});

test('findTrips: výpadek Wikidata → chyba (endpoint ji převede na 503)', async () => {
  const stub = stubFetch(() => ({ status: 500, body: 'error' }));
  try {
    await assert.rejects(findTrips({ lat: 40.4168, lon: -3.7038 }));
  } finally {
    stub.restore();
  }
});

test('groupBindings/findTrips: lázně poznané podle popisu', async () => {
  const { stubFetch: sf } = await import('./helpers.js');
  const rows = [
    row('Q501', 'Karlovy Vary', 50.2306, 12.8711, 100, 'Q515', { itemDescription: lit('lázeňské město v Česku') }),
    row('Q502', 'Plzeň', 49.7475, 13.3776, 120, 'Q515', { itemDescription: lit('statutární město') }),
  ];
  const stub = sf((url) => {
    if (url.startsWith('https://query.wikidata.org/sparql')) {
      const q = decodeURIComponent(new URL(url).searchParams.get('query'));
      return { body: { results: { bindings: q.includes('"120"') ? rows : [] } } };
    }
    return { body: { query: { pages: [] } } };
  });
  try {
    const trips = await findTrips({ lat: 50.0875, lon: 14.4213 });
    const kv = trips.find((t) => t.id === 'Q501');
    assert.equal(kv.spa, true);
    assert.equal(kv.categoryLabel, 'Lázně');
    assert.ok(!trips.find((t) => t.id === 'Q502').spa);
  } finally {
    stub.restore();
  }
});

// ---------- živá data (říjen 2026): cíle výletů z Barcelony a Prahy ----------
const { bindings, unescoBindings, BCN_TRIPS, PRA_TRIPS, PRA_UNESCO } = await import('./fixtures/wikidata.js');

test('tripsFromRows (živá data, Barcelona): památková ochrana obce nerozhoduje, Montserrat místo obce pod ním', async () => {
  const { tripsFromRows } = await import('../server/lib/poi.js');
  const trips = tripsFromRows(bindings(BCN_TRIPS), { lat: 41.3874, lon: 2.1686 }, 15, { road: true });
  const score = Object.fromEntries(trips.map((t) => [t.name, t.score]));
  // La Granada a Avinyonet mají ochranu „kulturní statek Katalánska“ na celé obci – dřív to stačilo na víc bodů než Girona
  for (const top of ['Girona', 'Sitges']) {
    for (const village of ['La Granada', 'Avinyonet de Puigventós']) assert.ok(score[top] > score[village] + 5, `${top} ${score[top]} > ${village} ${score[village]}`);
  }
  assert.ok(score.Girona > score['Lloret de Mar'], 'Lloret de Mar bez bodů za ochranu obce');
  // obec pojmenovaná po hoře hned vedle → cílem je hora, obec v „uvidíš“
  const mont = trips.find((t) => t.id === 'Q732115');
  assert.equal(mont?.name, 'Montserrat');
  assert.equal(mont.tripKind, 'nature');
  assert.equal(mont.gateway, 'Monistrol de Montserrat');
  assert.deepEqual(mont.highlights, ['Monistrol de Montserrat']);
  assert.ok(!trips.some((t) => t.id === 'Q16704'), 'obec Monistrol zvlášť ne');
  assert.equal(trips.find((t) => t.name === 'Girona').wv, true, 'článek na Wikivoyage');
  assert.ok(!trips.find((t) => t.name === 'La Granada').wv);
});

test('tripsFromRows (živá data, Praha): část sériové památky UNESCO je jen malé plus, celá památka hodně', async () => {
  const { tripsFromRows, unescoSites } = await import('../server/lib/poi.js');
  const unesco = unescoSites(unescoBindings(PRA_UNESCO));
  const trips = tripsFromRows(bindings(PRA_TRIPS), { lat: 50.08804, lon: 14.42076 }, 15, { road: true, unesco });
  const by = Object.fromEntries(trips.map((t) => [t.name, t]));
  const mining = ['Annaberg-Buchholz', 'Olbernhau', 'Freiberg', 'Altenberg', 'Dippoldiswalde'].map((n) => by[n]).filter(Boolean);
  assert.ok(mining.length >= 4);
  assert.ok(mining.every((t) => t.unescoPart && !t.unesco), 'hornická městečka = část Hornického regionu Krušnohoří');
  assert.equal(by['Kutná Hora'].unesco, true);
  for (const t of mining) assert.ok(by['Kutná Hora'].score > t.score + 15, `Kutná Hora ${by['Kutná Hora'].score} ≫ ${t.name} ${t.score}`);
  for (const t of mining) assert.ok(by['Drážďany'].score > t.score, `Drážďany před ${t.name}`);
  // jedna položka s víc body (Žatec a krajina žateckého chmele) není sériová památka – Žatec je celé UNESCO
  assert.equal(by['Žatec'].unesco, true);
});

test('groupBindings: muzeum v paláci se jménem muzea je muzeum (Museo Poldi Pezzoli), palác se sbírkou bez něj palácem; městská brána památník, ne hrad', async () => {
  const { bindings } = await import('./fixtures/wikidata.js');
  const rows = bindings([
    ['Q1', 'Museo Poldi Pezzoli', 'muzeum v Miláně', 45.4686, 9.1932, 40, ['Q33506', 'Q16560'], [], []],
    ['Q2', 'Palazzo Rosso', 'palác v Janově', 44.4105, 8.9338, 40, ['Q16560', 'Q33506'], [], []],
    // jen „opevnění“ (Q57821): městská brána je krátká zastávka, pevnost (Q1785071) zůstane hradem
    ['Q3', 'Floriánská brána', 'brána v Krakově', 45.465, 9.19, 40, ['Q57821'], [], []],
    ['Q4', 'Barbakan', 'hradební brána v Krakově', 45.466, 9.19, 40, ['Q57821'], [], []],
    ['Q5', 'Pevnost Špilberk', 'pevnost v Brně', 45.467, 9.19, 40, ['Q1785071', 'Q57821'], [], []],
  ]);
  const by = Object.fromEntries(groupBindings(rows, { lat: 45.46, lon: 9.19 }).map((p) => [p.name, p.category]));
  assert.deepEqual(by, { 'Museo Poldi Pezzoli': 'museum', 'Palazzo Rosso': 'palace', 'Floriánská brána': 'monument', Barbakan: 'monument', 'Pevnost Špilberk': 'castle' });
});

test('unescoSites: část sériové památky se pozná i podle čísla části, když v okruhu leží jen jedna (živě: Nizza Monferrato = 1390rev-004)', async () => {
  const { unescoSites } = await import('../server/lib/poi.js');
  const row = (id, name, whs) => ({ item: { value: `http://www.wikidata.org/entity/${id}` }, itemLabel: { value: name }, lat: { value: '44.77' }, lon: { value: '8.35' }, whs: { value: whs } });
  const s = (rows) => Object.fromEntries(unescoSites(rows).map((u) => [u.name, u.serial]));
  assert.deepEqual(s([row('Q1', 'Nizza Monferrato', '1390rev-004'), row('Q2', 'Castelseprio', '1318-003'), row('Q3', 'Žatec a krajina', '1558-2023'), row('Q4', 'Ivrea', '1538')]),
    { 'Nizza Monferrato': true, Castelseprio: false, 'Žatec a krajina': false, Ivrea: false }, '4. část = aspoň 4 části; rok za pomlčkou není část');
});

test('groupBindings (živá data): park Güell, Sant Pau, Barri Gòtic, kláštery; stadion a hotel níž, kavárna na půl hodiny', async () => {
  const { BCN_CITY, LIS_CITY, PRA_CITY } = await import('./fixtures/wikidata.js');
  const places = [
    ...groupBindings(bindings(BCN_CITY), { lat: 41.3874, lon: 2.1686 }),
    ...groupBindings(bindings(LIS_CITY), { lat: 38.7223, lon: -9.1393 }),
    ...groupBindings(bindings(PRA_CITY), { lat: 50.0875, lon: 14.4214 }),
  ];
  const by = Object.fromEntries(places.map((p) => [p.id, p]));
  const cat = (id) => by[id]?.category;
  // památka s typem „zařízení“ (park Güell) – konkrétní typ vyhrává nad vyloučením
  assert.equal(cat('Q212867'), 'park');
  // nemocnice Sant Pau: známá památka, kterou vyřazovala jen „nemocnice“
  assert.equal(cat('Q507282'), 'sight');
  // klášter s typem „sídlo“ je klášter (Strahov, Jerónimos), ne obec ani historické centrum
  assert.equal(cat('Q969482'), 'church');
  assert.equal(cat('Q272781'), 'church');
  // historická čtvrť, která je i „sídlo“ a turistický cíl
  assert.equal(cat('Q17154'), 'oldtown');
  // skutečná města zůstanou městy (Praha, Staré Město s typem čtvrť bez „turistického cíle“, čtvrť Sagrada Família)
  for (const id of ['Q1085', 'Q748211', 'Q2470217']) assert.equal(cat(id), 'town', by[id]?.name);
  // stadion, hotel, univerzita: v seznamu zůstanou, ale o 15 bodů níž
  for (const id of ['Q275715', 'Q1425790', 'Q1636837']) {
    assert.ok(by[id], id);
    assert.equal(by[id].minor, true, by[id].name);
    assert.equal(scorePlace(by[id]), Math.round((scorePlace({ ...by[id], minor: false }) - 15) * 10) / 10);
  }
  // stadion nebo býčí aréna jako památka s konkrétním typem (náměstí) ne – vyloučení platí
  assert.equal(cat('Q7875112'), undefined);
  assert.equal(cat('Q337522'), undefined);
  // kavárna / restaurace: krátká zastávka, ne vyřazení
  for (const id of ['Q1333395', 'Q2547006']) {
    assert.equal(by[id].eatery, true, by[id].name);
    assert.equal(by[id].visitMin, 30);
    assert.ok(!by[id].minor);
  }
  assert.ok(!by.Q2334312.eatery && by.Q2334312.category === 'theatre', 'Obecní dům s kavárnou je pořád koncertní sál');
  // obecná zajímavost podle začátku popisu: „muzeum“, „Gardens in Lisbon“; vlastní jména a poloha ne
  assert.equal(cat('Q1286354'), 'museum');
  assert.equal(cat('Q8843624'), 'park');
  assert.equal(cat('Q724388'), 'sight', 'někdejší radnice Hradčan není hrad');
  assert.equal(cat('Q244816'), 'sight', 'Tančící dům „na nároží Jiráskova náměstí“ není náměstí');
  // co dřív vypadlo, zůstane venku (Karolinum: „zařízení“ s 12 jazykovými verzemi, Strahovský stadion)
  assert.equal(cat('Q920703'), undefined);
  assert.equal(cat('Q1353687'), undefined);
  assert.equal(cat('Q48435'), 'church');
  // zámek (château) je „Palác / zámek“, brána v hradbách s výstavou je věž – ne hrad ani muzeum na dvě hodiny
  assert.equal(cat('Q80843'), 'palace', 'zámek Troja');
  assert.equal(cat('Q1488700'), 'tower', 'Prašná brána');
});

test('findPlaces: kavárna s popiskem „Kavárna / restaurace“, interní příznaky ven nejdou', async () => {
  const { BCN_CITY } = await import('./fixtures/wikidata.js');
  const stub = stubFetch((url) => {
    if (url.startsWith('https://query.wikidata.org/sparql')) {
      const q = decodeURIComponent(new URL(url).searchParams.get('query'));
      return { body: { results: { bindings: q.includes('"120"') ? [] : bindings(BCN_CITY) } } };
    }
    return { body: { query: { pages: [] } } };
  });
  try {
    const items = await findPlaces({ lat: 41.3874 + 2e-4, lon: 2.1686, radiusKm: 10, dayTrips: false });
    const gats = items.find((p) => p.id === 'Q1333395');
    assert.equal(gats.categoryLabel, 'Kavárna / restaurace');
    assert.equal(gats.visitMin, 30);
    assert.ok(items.every((p) => p.minor === undefined && p.wv === undefined));
    const ids = items.map((p) => p.id);
    assert.ok(ids.indexOf('Q275715') > ids.indexOf('Q212867'), 'stadion až za parkem Güell');
  } finally {
    stub.restore();
  }
});

test('findPlaces: anglický úvod z Wikipedie ustoupí českému popisu z Wikidat, jinak je označený jako anglický', async () => {
  const rows = [
    // jen anglický článek, ale český popis na Wikidatech
    row('Q658271', 'Tibidabo', 41.4225, 2.1186, 31, 'Q8502', { en: uri('https://en.wikipedia.org/wiki/Tibidabo'), itemDescription: lit('hora ve Španělsku'), csd: lit('hora ve Španělsku') }),
    // jen anglický článek i popis
    row('Q1050032', 'Museu Picasso', 41.3852, 2.1809, 30, 'Q33506', { en: uri('https://en.wikipedia.org/wiki/Museu_Picasso'), itemDescription: lit('art museum in Barcelona, Spain') }),
    // český popis jedním slovem nic neřekne – zůstane anglický úvod
    row('Q1286354', 'Námořní muzeum', 41.375, 2.1764, 16, 'Q33506', { en: uri('https://en.wikipedia.org/wiki/Maritime_Museum_of_Barcelona'), itemDescription: lit('muzeum'), csd: lit('muzeum') }),
  ];
  const stub = stubFetch((url) => {
    if (url.startsWith('https://query.wikidata.org/sparql')) return { body: { results: { bindings: decodeURIComponent(url).includes('"120"') ? [] : rows } } };
    if (url.startsWith('https://en.wikipedia.org/w/api.php')) {
      return { body: { query: { pages: [
        { title: 'Tibidabo', extract: 'Tibidabo is a mountain overlooking Barcelona.' },
        { title: 'Museu Picasso', extract: 'The Museu Picasso houses works by Pablo Picasso.' },
        { title: 'Maritime Museum of Barcelona', extract: 'The Maritime Museum of Barcelona is in the Drassanes.' },
      ] } } };
    }
    return { body: { query: { pages: [] } } };
  });
  try {
    const items = await findPlaces({ lat: 41.3874 + 3e-3, lon: 2.1686, radiusKm: 10, dayTrips: false });
    const by = Object.fromEntries(items.map((p) => [p.id, p]));
    assert.equal(by.Q658271.extract, undefined);
    assert.equal(by.Q658271.extractEn, 'Tibidabo is a mountain overlooking Barcelona.');
    assert.equal(by.Q658271.description, 'hora ve Španělsku');
    assert.equal(by.Q658271.descLang, 'cs');
    assert.equal(by.Q1050032.extract, 'The Museu Picasso houses works by Pablo Picasso.');
    assert.equal(by.Q1050032.descLang, 'en', 'aplikace ho zkrátí a označí „anglicky“');
    assert.equal(by.Q1286354.extract, 'The Maritime Museum of Barcelona is in the Drassanes.');
    assert.equal(by.Q1286354.descLang, 'en');
  } finally {
    stub.restore();
  }
});

test('místní názvy: jazyk podle země (Katalánsko katalánsky, jen latinkou), dotaz je hledá jen když je potřeba', async () => {
  const { localLang, sparqlNear } = await import('../server/lib/poi.js');
  assert.equal(localLang(41.3874, 2.1686), 'ca', 'Barcelona');
  assert.equal(localLang(39.5696, 2.6502), 'ca', 'Palma');
  assert.equal(localLang(40.4168, -3.7038), 'es', 'Madrid');
  assert.equal(localLang(38.7223, -9.1393), 'pt', 'Lisabon');
  assert.equal(localLang(48.8566, 2.3522), 'fr', 'Paříž');
  assert.equal(localLang(50.0875, 14.4213), '', 'Praha – stačí česky');
  assert.equal(localLang(37.9838, 23.7275), '', 'Atény – řecké písmo ne, zůstane anglický název');
  const q = sparqlNear(41.3874, 2.1686, 10, 4, 500, { lang: 'ca' });
  assert.match(q, /\?item rdfs:label \?loc FILTER\(lang\(\?loc\) = "ca"\)/);
  assert.match(q, /\?item schema:description \?csd FILTER\(lang\(\?csd\) = "cs"\)/);
  assert.match(q, /\?item wdt:P757 \?whs/);
  assert.ok(!sparqlNear(50.0875, 14.4213, 10, 4, 500).includes('?loc'), 'bez místního jazyka bez ?loc');
});

test('groupBindings (živá data): bez českého názvu místní (Font Màgica, Paço da Ribeira), popis s jazykem, UNESCO z čísla památky', async () => {
  const { BCN_LOC, LIS_LOC } = await import('./fixtures/wikidata.js');
  const by = Object.fromEntries([
    ...groupBindings(bindings(BCN_LOC), { lat: 41.3874, lon: 2.1686 }),
    ...groupBindings(bindings(LIS_LOC), { lat: 38.7223, lon: -9.1393 }),
  ].map((p) => [p.id, p]));
  // dřív anglicky: Magic Fountain of Montjuïc, Columbus Monument, Montjuïc Castle, Royal Square, Ribeira Palace…
  assert.equal(by.Q1414600.name, 'Font Màgica de Montjuïc');
  assert.equal(by.Q2288815.name, 'Monument a Colom');
  assert.equal(by.Q2500125.name, 'Castell de Montjuïc', 'velké písmeno i u „castell de Montjuïc“');
  assert.equal(by.Q1519964.name, 'Plaça Reial');
  assert.equal(by.Q2293331.name, 'Basílica de Santa Maria del Pi');
  assert.equal(by.Q1334899.name, 'Mercat de la Boqueria');
  assert.equal(by.Q1939953.name, 'Paço da Ribeira');
  assert.equal(by.Q1549270.name, 'Praça de D. Pedro IV', 'Rossio – úřední název z cedulí');
  // český název má přednost před místním
  assert.equal(by.Q48435.name, 'Sagrada Família');
  assert.equal(by.Q215003.name, 'Belémská věž');
  assert.equal(by.Q272781.name, 'Klášter svatého Jeronýma');
  assert.equal(by.Q301135.name, 'Parc de la Ciutadella');
  // popis česky, jinak anglicky se značkou jazyka (aplikace ho zkrátí a označí „anglicky“)
  assert.equal(by.Q215003.description, 'opevněná věž v Lisabonu');
  assert.equal(by.Q215003.descLang, 'cs');
  assert.equal(by.Q212867.descLang, 'cs');
  assert.equal(by.Q1050032.description, 'art museum in Barcelona, Spain');
  assert.equal(by.Q1050032.descLang, 'en');
  assert.equal(by.Q432290.descLang, 'en');
  // UNESCO z čísla památky (P757): Sant Pau a Belémská věž ho mají bez P1435 = UNESCO
  assert.equal(by.Q507282.unesco, true);
  assert.equal(by.Q507282.category, 'sight');
  assert.ok(!by.Q507282.minor, 'nemocnice Sant Pau není „jen nemocnice“');
  assert.equal(by.Q215003.unesco, true);
  // pomocná pole ven nejdou
  for (const p of Object.values(by)) assert.ok(p.csName === undefined && p.locName === undefined && p.csDesc === undefined);
});

test('groupBindings: kostel, který je i muzeem (Pantheon), je kostel; muzeum se jménem v kostele zůstane muzeem; fórum je naleziště', () => {
  const rows = [
    row('Q99309', 'Pantheon', 41.8986, 12.4769, 81, 'Q16970'), row('Q99309', 'Pantheon', 41.8986, 12.4769, 81, 'Q33506'),
    row('Q1', 'Museo di San Marco', 43.7781, 11.2594, 40, 'Q16970'), row('Q1', 'Museo di San Marco', 43.7781, 11.2594, 40, 'Q33506'),
  ];
  // Forum Romanum: forum (náměstí) i archeologické naleziště → naleziště
  rows.push(row('Q180212', 'Forum Romanum', 41.8925, 12.4853, 72, 'Q174782'), row('Q180212', 'Forum Romanum', 41.8925, 12.4853, 72, 'Q839954'));
  // Casa Vicens: muzeum, ale dům-muzeum (historic house museum) – prohlídka na 75 min, ne 2 h; obyčejné muzeum bez délky
  rows.push(row('Q1144374', 'Casa Vicens', 41.4035, 2.1508, 33, 'Q33506', { whs: lit('320') }), row('Q1144374', 'Casa Vicens', 41.4035, 2.1508, 33, 'Q2087181'));
  const out = groupBindings(rows, { lat: 41.9, lon: 12.5 });
  const by = Object.fromEntries(out.map((p) => [p.name, p.category]));
  assert.deepEqual(by, { Pantheon: 'church', 'Museo di San Marco': 'museum', 'Forum Romanum': 'ruins', 'Casa Vicens': 'museum' });
  const vm = Object.fromEntries(out.map((p) => [p.name, p.visitMin]));
  assert.deepEqual([vm['Casa Vicens'], vm['Museo di San Marco']], [75, undefined]);
});

test('familySlots: Řím plný kostelů a muzeí – pár míst pro zoo, zábavní park a park zůstane, limit platí', async () => {
  const { familySlots } = await import('../server/lib/poi.js');
  const P = (id, category, score, extra = {}) => ({ id, category, score, ...extra });
  const sights = Array.from({ length: 70 }, (_, i) => P(`s${i}`, ['church', 'museum', 'ruins'][i % 3], 90 - i * 0.5));
  const family = [P('zoo', 'zoo', 40), P('park1', 'park', 38), P('park2', 'park', 36), P('park3', 'park', 35), P('minor', 'theme', 50, { minor: true })];
  const out = familySlots([...sights, ...family].sort((a, b) => b.score - a.score), 60);
  assert.equal(out.length, 60);
  assert.deepEqual(out.filter((p) => ['zoo', 'theme', 'park'].includes(p.category)).map((p) => p.id), ['zoo', 'park1', 'park2']);
  assert.ok(out.every((p, i) => i === 0 || out[i - 1].score >= p.score), 'seřazené podle skóre');
  assert.ok(out.some((p) => p.id === 's56') && !out.some((p) => p.id === 's57'), 'ustoupila nejslabší jiná místa');
  // vejde-li se všechno, nic se nemění
  const few = [...sights.slice(0, 10), ...family].sort((a, b) => b.score - a.score);
  assert.deepEqual(familySlots(few, 60), few);
});
