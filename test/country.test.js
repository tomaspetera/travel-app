// 🌍 Celá země v Objevuj: města a cíle z článku o zemi na Wikivoyage, UNESCO a národní parky z Wikidat (server/lib/poi.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stubFetch } from './helpers.js';
import {
  destLine, parseDestinations, sparqlCountryId, sparqlCountryList, sparqlCountry, countryGroups, countryHighlights, countryCached, countryWithDistance, mockCountry, COUNTRY_KINDS,
  COUNTRY_CATS, catsOf, sparqlCountryCat, countryById, countryCategory, countryCatCached, mockCountryCat, withDistance,
} from '../server/lib/poi.js';

// Úryvek článku „Portugal“ z Wikivoyage (10/2026): šablona marker s QID a polohou, kotva #Q…, prostý odkaz bez šablony
const WV = `Intro.
==Regions==
* [[Algarve]] – beaches
==Cities==
*{{marker|type=city|name=[[Lisbon]]|wikidata=Q597}} (''Lisboa'') – national capital, city of the seven hills, home to [[Lisbon/Belém|Belem]] which is a {{UNESCO}}
*{{marker|type=city|name=[[Porto]]|wikidata=Q36433}} – the northern capital, "Invincible City"
* [[Évora]] — "Museum City", Alentejo regional capital
** [[Évora/Old town|Old town]] – podbod se nebere
==Other destinations==
* {{marker|type=vicinity|name=[[Sintra#Q169175|Cabo da Roca]]|url=|lat=38.780833|long=-9.500556|wikidata=Q169175}} – the westernmost point of mainland Portugal
* {{marker|type=vicinity|name=[[Peneda-Gerês National Park]]|url=|lat=41.730339|long=-8.161681}} – Portugal's only national park
==Understand==
* [[Neplatí]] – jiná sekce`;

test('Wikivoyage: řádky seznamu Cities a Other destinations → cíle (QID, poloha ze šablony, popis bez místního názvu)', () => {
  const d = parseDestinations(WV);
  assert.deepEqual(d.city.map((x) => [x.label, x.wikidata]), [['Lisbon', 'Q597'], ['Porto', 'Q36433'], ['Évora', null]]);
  assert.equal(d.city[0].blurb, 'national capital, city of the seven hills, home to Belem which is a UNESCO');
  assert.equal(d.city[2].blurb, '"Museum City", Alentejo regional capital');
  assert.equal(d.city[2].title, 'Évora');
  assert.deepEqual(d.dest.map((x) => [x.label, x.title, x.wikidata, x.lat, x.lon]), [['Cabo da Roca', 'Sintra', 'Q169175', 38.780833, -9.500556], ['Peneda-Gerês National Park', 'Peneda-Gerês National Park', null, 41.730339, -8.161681]]);
  assert.deepEqual(parseDestinations(''), { city: [], dest: [] });
  assert.equal(destLine('* bez odkazu'), null);
  assert.equal(destLine('*{{marker|type=city|name=Funchal|lat=x|wikidata=bad}} – capital of Madeira').label, 'Funchal', 'jméno bez odkazu, neplatná poloha a QID pryč');
  assert.equal(destLine('*{{marker|type=city|name=Funchal|lat=x|wikidata=bad}}').wikidata, null);
});

test('dotazy SPARQL: QID země podle kódu, UNESCO jen této země, parky, podrobnosti podle QID', () => {
  assert.match(sparqlCountryId('IT'), /wdt:P297 "IT"/);
  assert.match(sparqlCountryId('I"T'), /"IT"/, 'jen písmena');
  const u = sparqlCountryList('Q38', 'unesco');
  assert.match(u, /wdt:P1435 wd:Q9259 ; wdt:P17 wd:Q38/);
  assert.match(u, /FILTER NOT EXISTS \{ \?item wdt:P17 \?o \. FILTER\(\?o != wd:Q38\) \}/, 'bez společných památek více zemí');
  assert.match(sparqlCountryList('Q38', 'park'), /wd:Q46169 ; wdt:P17 wd:Q38/);
  assert.match(sparqlCountryList('Q38; DROP', 'park'), /wd:Q38 ;/, 'QID jen Q a číslice');
  assert.match(sparqlCountry(['Q220', 'Q641']), /VALUES \?item \{ wd:Q220 wd:Q641 \}/);
  assert.match(sparqlCountryList('Q38', 'city'), /wd:Q515 wd:Q1549591 wd:Q1637706 wd:Q5119 \} \?item wdt:P31 \?t ; wdt:P17 wd:Q38/);
});

const lit = (v) => ({ type: 'literal', value: String(v) });
const ent = (q) => ({ type: 'uri', value: `http://www.wikidata.org/entity/${q}` });
const row = (q, name, lat, lon, sl, o = {}) => ({ item: ent(q), itemLabel: lit(name), lat: lit(lat), lon: lit(lon), sl: lit(sl), ...(o.cs ? { cs: { type: 'uri', value: `https://cs.wikipedia.org/wiki/${encodeURIComponent(o.cs)}` } } : {}), ...(o.csd ? { csd: lit(o.csd) } : {}), ...(o.img ? { img: { type: 'uri', value: `http://commons.wikimedia.org/wiki/Special:FilePath/${o.img}` } } : {}) });

test('skupiny: Wikivoyage v pořadí redaktorů, UNESCO a parky podle významu bez opakování, cíl bez QID s polohou ze šablony', () => {
  const rows = [
    row('Q597', 'Lisabon', 38.72, -9.14, 250, { cs: 'Lisabon', csd: 'hlavní město Portugalska', img: 'Lisboa.jpg' }),
    row('Q36433', 'Porto', 41.15, -8.61, 200),
    row('Q169175', 'Cabo da Roca', 38.78, -9.5, 40),
    row('Q1', 'Klášter jeronymitů', 38.69, -9.2, 80),
    row('Q2', 'Sintra (kulturní krajina)', 38.79, -9.39, 60),
    row('Q3', 'Q3', 40, -8, 10), // bez jména
    row('Q4', 'Peneda-Gerês', 41.73, -8.16, 30),
  ];
  const wv = parseDestinations(WV);
  const g = countryGroups(rows, wv, { unesco: ['Q2', 'Q1', 'Q597', 'Q3'], park: ['Q4'] });
  assert.deepEqual(g.city.map((x) => x.name), ['Lisabon', 'Porto'], 'Évora bez QID a polohy vypadne');
  assert.equal(g.city[0].unesco, true, 'Lisabon je i UNESCO');
  assert.equal(g.city[0].image, 'https://commons.wikimedia.org/wiki/Special:FilePath/Lisboa.jpg?width=500');
  assert.equal(g.city[0].blurb, wv.city[0].blurb);
  assert.deepEqual(g.dest.map((x) => [x.name, x.wv]), [['Cabo da Roca', true], ['Peneda-Gerês National Park', true]], 'park bez QID s polohou ze šablony');
  assert.deepEqual(g.unesco.map((x) => x.name), ['Klášter jeronymitů', 'Sintra (kulturní krajina)'], 'Lisabon už je mezi městy, položka bez jména ne');
  assert.deepEqual(g.park.map((x) => x.name), ['Peneda-Gerês']);
  assert.ok(COUNTRY_KINDS.every((k) => g[k].every((x) => !('kinds' in x) && !('types' in x) && Array.isArray(x.cats))));
  const d = countryWithDistance(g, 38.7223, -9.1393);
  assert.equal(d.city[0].distanceKm, 0);
  assert.equal(d.city[1].distanceKm, 274);
  assert.equal(countryWithDistance(g, NaN, NaN).city[0].distanceKm, undefined);
});

test('countryHighlights: Wikivoyage + 4 krátké dotazy na Wikidata + popisy; mezipaměť; výpadek Wikivoyage = jen UNESCO a parky na hodinu', async () => {
  const sparql = [];
  const stub = stubFetch((url) => {
    if (url.startsWith('https://en.wikivoyage.org/w/api.php')) {
      const u = new URL(url);
      if (u.searchParams.get('titles') === 'Portugal') return { body: { query: { pages: [{ title: 'Portugal', revisions: [{ slots: { main: { content: WV } } }] }] } } };
      if (u.searchParams.get('prop') === 'pageprops') return { body: { query: { pages: [{ title: 'Évora', pageprops: { wikibase_item: 'Q179948' } }, { title: 'Peneda-Gerês National Park', pageprops: { wikibase_item: 'Q4' } }] } } };
      return { status: 503, body: 'down' };
    }
    if (url.startsWith('https://query.wikidata.org/sparql')) {
      const q = decodeURIComponent(new URL(url).searchParams.get('query'));
      sparql.push(q);
      if (q.includes('wdt:P297')) return { body: { results: { bindings: [{ c: ent('Q45') }] } } };
      if (q.includes('wd:Q9259')) return { body: { results: { bindings: [{ item: ent('Q1'), sl: lit(80) }] } } };
      if (q.includes('wd:Q46169')) return { body: { results: { bindings: [{ item: ent('Q4'), sl: lit(30) }] } } };
      if (q.includes('wd:Q515')) return { body: { results: { bindings: [{ item: ent('Q597'), sl: lit(250) }] } } };
      return { body: { results: { bindings: [row('Q597', 'Lisabon', 38.72, -9.14, 250, { cs: 'Lisabon' }), row('Q179948', 'Évora', 38.57, -7.91, 120), row('Q1', 'Klášter jeronymitů', 38.69, -9.2, 80), row('Q4', 'Peneda-Gerês', 41.73, -8.16, 30)] } } };
    }
    if (url.startsWith('https://cs.wikipedia.org/w/api.php')) return { body: { query: { pages: [{ title: 'Lisabon', extract: 'Lisabon je hlavní město Portugalska.' }] } } };
    return { body: { query: { pages: [] } } };
  });
  try {
    assert.equal(countryCached('PT'), false);
    const g = await countryHighlights('PT');
    assert.equal(sparql.length, 4, 'QID země, UNESCO, parky, podrobnosti');
    assert.match(sparql[3], /VALUES \?item \{ wd:Q597 wd:Q36433 wd:Q179948 wd:Q169175 wd:Q4 wd:Q1 \}/, 'cíle Wikivoyage (i QID z pageprops) + UNESCO + parky bez opakování');
    assert.deepEqual(g.city.map((x) => x.name), ['Lisabon', 'Évora']);
    assert.equal(g.city[0].extract, 'Lisabon je hlavní město Portugalska.');
    assert.equal(g.city[0].url, 'https://cs.wikipedia.org/wiki/Lisabon');
    assert.deepEqual(g.dest.map((x) => x.name), ['Cabo da Roca', 'Peneda-Gerês'], 'park z Wikivoyage mezi cíli, ne znovu mezi parky');
    assert.deepEqual(g.park, []);
    assert.deepEqual(g.unesco.map((x) => x.name), ['Klášter jeronymitů']);
    assert.equal(g.degraded, undefined);
    assert.equal(countryCached('PT'), true);
    await countryHighlights('PT');
    assert.equal(sparql.length, 4, 'podruhé z mezipaměti');
    // Wikivoyage nedostupná (Kanada tu neodpovídá) → velkoměsta z Wikidat (dotaz navíc), UNESCO a parky, neúplné na hodinu
    const n = sparql.length;
    const ca = await countryHighlights('CA');
    assert.equal(ca.degraded, true);
    assert.equal(sparql.length - n, 5, 'i dotaz na velkoměsta');
    assert.deepEqual([ca.city.map((x) => x.name), ca.dest.length, ca.unesco.length], [['Lisabon'], 0, 1]);
  } finally {
    stub.restore();
  }
});

test('countryHighlights: Wikidata nedostupná → chyba (endpoint ji převede na 503)', async () => {
  const stub = stubFetch((url) => (url.includes('wikivoyage') ? { body: { query: { pages: [] } } } : { status: 500, body: 'x' }));
  try {
    await assert.rejects(countryHighlights('NZ'));
  } finally {
    stub.restore();
  }
});

test('DEMO: vymyšlený přehled země ve všech skupinách', () => {
  const m = mockCountry({ lat: 50, lon: 15 });
  assert.deepEqual(COUNTRY_KINDS.map((k) => m[k].length > 0), [true, true, true, true]);
  assert.ok(COUNTRY_KINDS.every((k) => m[k].every((x) => x.description === 'demo data' && Number.isFinite(x.lat))));
  assert.equal(new Set(COUNTRY_KINDS.flatMap((k) => m[k].map((x) => x.id))).size, COUNTRY_KINDS.reduce((s, k) => s + m[k].length, 0), 'jedinečná ID');
});

// 🌍 „Co hledáš?“: hory, pláže, ostrovy, jezera, hrady a zajímavá místa země
test('kategorie země: vyhledání podle země a tříd P31 (OR), podle odkazů, nejvýš 24; neznámá kategorie chyba', () => {
  const q = sparqlCountryCat('Q38', 'mountain');
  assert.match(q, /mwapi:srsearch "haswbstatement:P17=Q38 haswbstatement:P31=Q8502\|P31=Q46831\|P31=Q8072\|P31=Q1061151"/);
  assert.match(q, /mwapi:srsort "incoming_links_desc"/);
  assert.match(q, /ORDER BY DESC\(\?sl\) LIMIT 24$/);
  assert.match(sparqlCountryCat('Q38"; DROP', 'castle'), /P17=Q38 haswbstatement:P31=Q23413\|P31=Q751876\|/, 'QID jen Q a číslice');
  for (const bad of ['bad', 'constructor', 'toString', '']) assert.throws(() => sparqlCountryCat('Q38', bad), /Neznámá kategorie/, bad);
  assert.deepEqual(Object.keys(COUNTRY_CATS), ['mountain', 'beach', 'island', 'lake', 'castle', 'sight']);
  assert.ok(Object.values(COUNTRY_CATS).every((l) => l.length && l.every((x) => /^Q\d+$/.test(x))));
  // podrobnosti: český štítek a třídy P31 položky
  assert.match(sparqlCountry(['Q1']), /SELECT .*\?csl \?t /);
  assert.match(sparqlCountry(['Q1']), /wdt:P31\/wdt:P279\? \?t/, 'třída i o úroveň výš (ledovcové jezero → jezero)');
  assert.match(sparqlCountryCat('Q38', 'lake', true), /LIMIT 24\n# znovu$/);
});

test('kategorie a příroda podle tříd P31; česká jména (štítek, název českého článku bez upřesnění, jinak štítek)', () => {
  assert.deepEqual(catsOf(['Q8502', 'Q23442']), { cats: ['mountain', 'island'], nature: true });
  assert.deepEqual(catsOf(new Set(['Q23413'])), { cats: ['castle'], nature: false });
  assert.deepEqual(catsOf(['Q46169']), { cats: [], nature: true }, 'národní park je příroda');
  assert.deepEqual(catsOf(), { cats: [], nature: false });
  const by = countryById([
    { ...row('Q5', 'Kromeriz Castle', 49.3, 17.4, 30), csl: lit('zámek Kroměříž') },
    { ...row('Q1', 'Loire Valley', 47.3, 0.7, 90, { cs: 'Údolí Loiry (Francie)' }), t: ent('Q39816') },
    { ...row('Q1', 'Loire Valley', 47.3, 0.7, 90, { cs: 'Údolí Loiry (Francie)' }), t: ent('Q9259') },
    { ...row('Q2', 'Mont Saint-Michel', 48.6, -1.5, 80, { cs: 'Mont-Saint-Michel' }), csl: lit('Mont-Saint-Michel (ostrov)') },
    row('Q3', 'Q3', 45, 2, 10),
    row('Q4', 'Bez polohy', 'x', 2, 10),
    row('Q1050483', 'Loire Valley', 47.4, 0.7, 60),
  ]);
  assert.deepEqual([...by.keys()], ['Q5', 'Q1', 'Q2', 'Q3', 'Q1050483']);
  assert.equal(by.get('Q1050483').name, 'Údolí Loiry', 'cíl Wikivoyage bez českého štítku i článku – ručně');
  assert.equal(by.get('Q5').name, 'Zámek Kroměříž', 'velké první písmeno');
  assert.equal(by.get('Q1').name, 'Údolí Loiry', 'anglický štítek → název českého článku');
  assert.deepEqual([...by.get('Q1').types], ['Q39816', 'Q9259'], 'třídy ze všech řádků');
  assert.equal(by.get('Q2').name, 'Mont-Saint-Michel (ostrov)', 'český štítek má přednost');
  assert.equal(by.get('Q3').name, '', 'jen QID = bez jména');
});

test('cíle Wikivoyage s kategoriemi podle tříd P31 (mys → pobřeží a příroda)', () => {
  const rows = [{ ...row('Q169175', 'Cabo da Roca', 38.78, -9.5, 40), t: ent('Q185113') }, row('Q597', 'Lisabon', 38.72, -9.14, 250)];
  const g = countryGroups(rows, parseDestinations(WV));
  assert.deepEqual(plainCats(g.dest), [['Cabo da Roca', ['beach'], true], ['Peneda-Gerês National Park', [], false]]);
  assert.deepEqual(plainCats(g.city), [['Lisabon', [], false]]);
});
const plainCats = (l) => l.map((x) => [x.name, x.cats, x.nature]);

test('countryCategory: QID země, vyhledání, podrobnosti; české názvy, podle jazykových verzí; mezipaměť pro každou kategorii zvlášť', async () => {
  const seen = [];
  const query = async (s) => {
    seen.push(s);
    if (s.includes('wdt:P297')) return [{ c: ent('Q213') }];
    if (s.includes('wikibase:mwapi')) return s.includes('P31=Q23413') ? [{ item: ent('Q10') }, { item: ent('Q11') }, { item: ent('Q12') }, { item: ent('Q10') }, { item: lit('nesmysl') }] : [];
    return [
      { ...row('Q11', 'Lednice Castle', 48.8, 16.8, 40), csl: lit('Zámek Lednice'), t: ent('Q751876') },
      { ...row('Q11', 'Lednice Castle', 48.8, 16.8, 40), t: ent('Q9259') },
      { ...row('Q10', 'Karlštejn Castle', 49.94, 14.19, 60, { cs: 'Karlštejn (hrad)' }), t: ent('Q23413') },
      row('Q12', 'Q12', 50, 15, 99),
    ];
  };
  assert.equal(countryCatCached('CZ', 'castle'), false);
  const r = await countryCategory('CZ', 'castle', { query });
  assert.equal(seen.length, 3, 'QID země, vyhledání, podrobnosti');
  assert.match(seen[1], /haswbstatement:P17=Q213 haswbstatement:P31=Q23413\|/);
  assert.match(seen[2], /VALUES \?item \{ wd:Q10 wd:Q11 wd:Q12 \}/, 'bez opakování a nesmyslů');
  assert.deepEqual(plainCats(r.items), [['Karlštejn', ['castle'], false], ['Zámek Lednice', ['castle'], false]], 'podle jazykových verzí, bez jména pryč');
  assert.ok(r.items.every((x) => !('types' in x) && !('kinds' in x) && !('wiki' in x) && Number.isFinite(x.lat)));
  assert.equal(r.degraded, undefined);
  assert.equal(countryCatCached('CZ', 'castle'), true);
  assert.equal(countryCatCached('CZ', 'mountain'), false, 'klíč mezipaměti podle kategorie');
  assert.equal(countryCatCached('SK', 'castle'), false, 'i podle země');
  await countryCategory('CZ', 'castle', { query });
  assert.equal(seen.length, 3, 'podruhé z mezipaměti');
  const none = await countryCategory('CZ', 'mountain', { query });
  assert.deepEqual([none.items, none.degraded], [[], true], 'prázdné hledání (i výpadek vyhledávání) jen na hodinu');
  assert.equal(seen.length, 6, 'jiná kategorie = vlastní hledání, prázdné ještě jednou jinak napsané, bez výsledků bez podrobností');
  assert.ok(!seen[4].includes('# znovu') && seen[5].endsWith('# znovu'));
  await assert.rejects(countryCategory('CZ', 'constructor', { query }), /Neznámá kategorie/);
  await assert.rejects(countryCategory('AT', 'lake', { query: async () => { throw new Error('WDQS 504'); } }), /504/, 'výpadek → chyba (endpoint 503)');
  assert.equal(countryCatCached('AT', 'lake'), false, 'chyba se neukládá');
});

test('DEMO: vymyšlená místa pro každou kategorii; vzdálenost jen s polohou', () => {
  for (const cat of Object.keys(COUNTRY_CATS)) {
    const m = mockCountryCat({ lat: 42, lon: 12.5 }, cat);
    assert.ok(m.items.length >= 2, cat);
    assert.ok(m.items.every((x) => x.cats.join() === cat && Number.isFinite(x.lat) && x.name && x.description === 'demo data'), cat);
  }
  assert.equal(mockCountryCat({ lat: 42, lon: 12.5 }, 'castle').items[0].nature, false);
  const d = withDistance(mockCountryCat({ lat: 42, lon: 12.5 }, 'beach').items, 42, 12.5);
  assert.ok(d.every((x) => x.distanceKm > 0 && x.distanceKm < 500));
  assert.equal(withDistance([{ lat: 1, lon: 1 }], NaN, NaN)[0].distanceKm, undefined);
});
