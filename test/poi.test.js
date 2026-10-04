import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stubFetch } from './helpers.js';
import { findPlaces, groupBindings, scorePlace } from '../server/lib/poi.js';

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
      return { body: { results: { bindings: q.includes('"120"') ? TRIPS : CITY } } };
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
    assert.equal(sparql.length, 2, 'město + výlety');
    assert.match(sparql[0].init.headers['User-Agent'], /^ATLAS-travel\/.*github\.com/);
    const duomo = items.find((p) => p.id === 'Q18068');
    assert.equal(duomo.extract, 'Milánská katedrála je gotická katedrála v Miláně.');
    assert.equal(duomo.extractLang, 'cs');
    assert.equal(duomo.image, 'https://upload.wikimedia.org/duomo-480.jpg');
    assert.equal(duomo.categoryLabel, 'Kostel / chrám');
    assert.equal(items.find((p) => p.id === 'Q1060').extractLang, 'en');
    const como = items.find((p) => p.id === 'Q6414');
    assert.equal(como.category, 'daytrip');
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
