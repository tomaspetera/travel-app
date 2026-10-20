// 🌍 Celá země v Objevuj: města a cíle z článku o zemi na Wikivoyage, UNESCO a národní parky z Wikidat (server/lib/poi.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stubFetch } from './helpers.js';
import { destLine, parseDestinations, sparqlCountryId, sparqlCountryList, sparqlCountry, countryGroups, countryHighlights, countryCached, countryWithDistance, mockCountry, COUNTRY_KINDS } from '../server/lib/poi.js';

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
  assert.ok(COUNTRY_KINDS.every((k) => g[k].every((x) => !('kinds' in x))));
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
