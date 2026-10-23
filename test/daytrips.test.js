import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stubFetch } from './helpers.js';
import { CLASSICS, CLASSIC_IDS, parseGoNext, reachOf, reachPenalty, rankTrips, whyOf } from '../server/lib/daytrips.js';
import { tripsFromRows, unescoSites, cityArticle, findTrips, mockTrips } from '../server/lib/poi.js';
import { bindings, unescoBindings } from './fixtures/wikidata.js';
import { LIS, ROM, NAP, KRK, VEN, CLASSICS_LIVE } from './fixtures/daytrips.js';
import { normalize } from '../server/lib/geo.js';

// Výlety jako v Objevuj / Programu (findPlaces): od 15 km, doporučené a klasické od 3 km, pořadí podle významu a dosahu.
const tripsOf = (c) => rankTrips(tripsFromRows(bindings(c.items), c.center, 15, {
  unesco: unescoSites(unescoBindings(c.unesco)), goNext: c.goNext, classic: CLASSIC_IDS, nearKm: 3,
}), { center: c.center });
const names = (list, n = 8) => list.slice(0, n).map((t) => t.name);

test('parseGoNext: odkazy jen z oddílu „Go next“, bez souborů a odkazů jinam, s rozlišením v závorce', () => {
  const text = `==Understand==
[[Naples]] je jinde.
==Go next==
{{seealso|Metropolitan Rome}}
[[File:Villa d'Este.jpg|thumb|Tivoli]]
* [[Cerveteri]] – etruská nekropole
* [[tivoli#Villa d'Este|Tivoli]] a [[Ostia]]
===Further===
* [[Toledo (Spain)|Toledo]], [[w:Pompeii|Pompeje]], [[Leonardo_da_Vinci-Fiumicino Airport]], [[Cerveteri]]
==See also==
* [[Naples]]`;
  assert.deepEqual(parseGoNext(text), ['Cerveteri', 'Tivoli', 'Ostia', 'Toledo (Spain)', 'Leonardo da Vinci-Fiumicino Airport']);
  assert.deepEqual(parseGoNext('==Get in==\n[[Rome]]'), []);
  assert.deepEqual(parseGoNext(null), []);
});

test('klasické výlety: krátký seznam QID, které na Wikidatech existují (živý dotaz 10/2026) – nic vymyšleného', () => {
  assert.ok(CLASSICS.size >= 40 && CLASSICS.size <= 60, `${CLASSICS.size} klasik`);
  assert.equal(new Set(CLASSIC_IDS).size, CLASSIC_IDS.length);
  const live = new Map(CLASSICS_LIVE.map(([q, name, lat, lon]) => [q, { name, lat, lon }]));
  for (const [q, name] of CLASSICS) {
    assert.match(q, /^Q\d+$/);
    const x = live.get(q);
    assert.ok(x && Number.isFinite(x.lat) && Number.isFinite(x.lon), `${q} ${name} má na Wikidatech polohu`);
    // název v seznamu je jen pro čtenáře kódu – musí odpovídat položce (Salcburk, Osvětim, „Versailles (zámek)“)
    const a = normalize(name).split(' ')[0];
    const b = normalize(x.name);
    assert.ok(b.includes(a) || a.includes(b.split(' ')[0]) || ['Q7341', 'Q828155', 'Q42646', 'Q1136637', 'Q43332'].includes(q), `${q}: ${name} × ${x.name}`);
  }
});

test('dosah: odhad vlakem/busem a autem, ostrov lodí, mimo trať déle; penalizace jen za dlouhou cestu', () => {
  const lisbon = LIS.center;
  const sintra = reachOf(lisbon, { lat: 38.7974, lon: -9.3904, tripKind: 'town' });
  assert.equal(sintra.mode, 'rail');
  assert.ok(sintra.transitMin >= 40 && sintra.transitMin <= 90 && sintra.carMin >= 25 && sintra.carMin <= 60, JSON.stringify(sintra));
  const castle = reachOf(lisbon, { lat: 38.7974, lon: -9.3904, tripKind: 'castle' });
  assert.equal(castle.transitMin, sintra.transitMin + 20, 'z nádraží ještě busem nebo pěšky');
  const capri = reachOf(NAP.center, { lat: 40.55, lon: 14.2333, tripKind: 'town', island: true });
  assert.deepEqual([capri.mode, capri.carMin], ['boat', null]);
  assert.equal(reachPenalty(30), 0);
  assert.equal(reachPenalty(45), 0);
  assert.equal(reachPenalty(120), 6);
  assert.equal(reachPenalty(150), 12);
  assert.equal(reachPenalty(180), 24, 'nad 2,5 h jednou cestou strmě');
});

test('rankTrips: předměstí bez památek a „letištní“ město pryč, doporučené zůstane; důvod v jedné větě', () => {
  const center = { lat: 41.89, lon: 12.48 };
  const town = (id, name, km, o = {}) => ({ id, name, lat: center.lat, lon: center.lon + km / 83, distanceKm: km, tripKind: 'town', category: 'daytrip', score: 70, sights: 0, ...o });
  const list = rankTrips([
    town('a', 'Předměstí', 20),
    town('b', 'Doporučené', 20, { goNext: true }),
    town('c', 'Letištní', 60, { airport: true }),
    town('d', 'Letištní s UNESCO', 60, { airport: true, unesco: true }),
    town('e', 'Vzdálené bez památek', 60),
    { ...town('f', 'Hrad', 20), tripKind: 'castle' },
  ], { center });
  assert.deepEqual(list.map((t) => t.id).sort(), ['b', 'd', 'e', 'f']);
  assert.ok(list.every((t) => t.reach && t.reach.transitMin > 0));
  assert.equal(list.find((t) => t.id === 'b').why, 'Výlet doporučuje průvodce Wikivoyage');
  assert.equal(whyOf({ unesco: true, classic: true, highlights: ['Palácio da Pena', 'Quinta da Regaleira', 'Moorish Castle'] }),
    'Památka UNESCO, oblíbený výlet z města · k vidění: Palácio da Pena, Quinta da Regaleira');
  assert.equal(whyOf({ tripKind: 'town' }), null);
  // doporučené blíž než 15 km je spíš kousek města (o 8 bodů níž), klasika ne
  const two = rankTrips([town('n', 'Blízko', 8, { goNext: true }), town('m', 'Blízko klasika', 8, { classic: true })], { center });
  assert.equal(two.find((t) => t.id === 'm').score - two.find((t) => t.id === 'n').score, 8);
  // plánovač výletů autem (road) počítá s časem cesty sám – bez penalizace
  const far = town('z', 'Daleko', 115, { goNext: true });
  assert.ok(rankTrips([far], { center, road: true })[0].score > rankTrips([far], { center })[0].score);
});

test('výlety (živá data, Lisabon): Sintra místo Setúbalu, Cascais a Óbidos mezi prvními; Almada za řekou bez UNESCO Belému', () => {
  const trips = tripsOf(LIS);
  assert.equal(trips[0].name, 'Sintra');
  assert.ok(trips[0].unesco && trips[0].why.startsWith('Památka UNESCO, oblíbený výlet'), trips[0].why);
  assert.ok(trips[0].reach.transitMin <= 90 && trips[0].reach.mode === 'rail');
  for (const n of ['Cascais', 'Óbidos']) assert.ok(names(trips, 5).includes(n), `${n} v ${names(trips)}`);
  assert.ok(!names(trips, 3).includes('Setúbal'), names(trips).join(', '));
  assert.ok(!trips.find((t) => t.name === 'Almada')?.unesco, 'Belém (UNESCO) patří Lisabonu, ne Almadě');
});

test('výlety (živá data, Řím): Tivoli první, Ostia Antica a Orvieto mezi prvními 8, Fiumicino (letiště) ne', () => {
  assert.equal(cityArticle(bindings(ROM.items), ROM.center), 'Rome');
  const raw = tripsFromRows(bindings(ROM.items), ROM.center, 15, { unesco: unescoSites(unescoBindings(ROM.unesco)), goNext: ROM.goNext, classic: CLASSIC_IDS, nearKm: 3 });
  assert.equal(raw.find((t) => t.name === 'Fiumicino')?.airport, true, 'obec pojmenovaná po letišti hned vedle');
  const trips = tripsOf(ROM);
  assert.equal(trips[0].name, 'Tivoli');
  assert.ok(!trips.some((t) => t.name === 'Fiumicino'));
  const ostia = trips.find((t) => t.id === 'Q1012797');
  assert.ok(ostia && names(trips).includes('Ostia Antica'), names(trips).join(', '));
  assert.equal(ostia.tripKind, 'ruins', 'antické město je naleziště, ne obec');
  assert.ok(!trips.some((t) => t.id === 'Q11171297'), 'obec Ostia (přístav) vedle naleziště zvlášť ne');
  assert.ok(names(trips).includes('Orvieto'));
});

test('výlety (živá data, Neapol): Pompeje (naleziště, ne obec Pompei), Amalfi a Capri lodí', () => {
  const trips = tripsOf(NAP);
  for (const n of ['Amalfi', 'Pompeje', 'Capri']) assert.ok(names(trips, 3).includes(n), `${n} v ${names(trips)}`);
  const pompeii = trips.find((t) => t.name === 'Pompeje');
  assert.deepEqual([pompeii.id, pompeii.tripKind, pompeii.gateway], ['Q43332', 'ruins', 'Pompei']);
  assert.ok(!trips.some((t) => t.id === 'Q36471'), 'obec Pompei zvlášť ne');
  const capri = trips.find((t) => t.name === 'Capri');
  assert.equal(capri.reach.mode, 'boat');
});

test('výlety (živá data, Krakov a Benátky): Wieliczka 12 km i Murano s Buranem v laguně – klasiky blíž než 15 km', () => {
  const krk = tripsOf(KRK);
  assert.deepEqual(names(krk, 2).sort(), ['Koncentrační tábor Osvětim', 'Wieliczka']);
  assert.ok(krk.find((t) => t.name === 'Wieliczka').unesco, 'solný důl hned u města');
  const ven = tripsOf(VEN);
  for (const n of ['Padova', 'Verona', 'Murano', 'Burano']) assert.ok(names(ven).includes(n), `${n} v ${names(ven)}`);
  const murano = ven.find((t) => t.name === 'Murano');
  assert.equal(murano.reach.mode, 'boat');
  assert.ok(!(murano.highlights || []).some((h) => /Marka|Benátky/.test(h)), 'památky Benátek nejsou „k vidění“ na Muranu');
});

test('tripsFromRows: výlet, jehož hlavní památka už je v programu ve městě (cover), se nenabízí', () => {
  const c = LIS;
  const all = tripsFromRows(bindings(c.items), c.center, 15, { unesco: unescoSites(unescoBindings(c.unesco)), classic: CLASSIC_IDS });
  const sintra = all.find((t) => t.name === 'Sintra');
  assert.ok(sintra);
  const cover = new Set([sintra.id]);
  assert.ok(!tripsFromRows(bindings(c.items), c.center, 15, { classic: CLASSIC_IDS, cover }).some((t) => t.name === 'Sintra'));
});

test('findTrips: doporučení „Go next“ z článku o městě na Wikivoyage – článek podle řádků výletů, položky podle názvu', async () => {
  const lit = (v) => ({ type: 'literal', value: String(v) });
  const ent = (q) => ({ type: 'uri', value: `http://www.wikidata.org/entity/${q}` });
  const row = (q, label, lat, lon, sl, type, x = {}) => ({ item: ent(q), itemLabel: lit(label), lat: lit(lat), lon: lit(lon), sl: lit(sl), type: ent(type), ...x });
  const wv = (t) => ({ wv: { type: 'uri', value: `https://en.wikivoyage.org/wiki/${t}` } });
  const rows = [
    row('Q1', 'Testov', 49.5, 15.5, 150, 'Q515', wv('Testov')), // samo město (článek „Testov“)
    row('Q2', 'Výletov', 49.8, 15.5, 60, 'Q515', wv('Vyletov')), // 33 km, bez památek
    row('Q3', 'Nudov', 49.5, 16.0, 70, 'Q515', wv('Nudov')), // 36 km, bez památek, nedoporučený
  ];
  const stub = stubFetch((url) => {
    if (url.startsWith('https://query.wikidata.org/sparql')) {
      const q = decodeURIComponent(new URL(url).searchParams.get('query'));
      if (q.includes('"120"')) return { body: { results: { bindings: rows } } };
      if (q.includes('VALUES ?gn')) return { body: { results: { bindings: [{ ...rows[1], gn: lit('Vyletov') }, { ...row('Q9', 'Cizí', 49.6, 15.5, 50, 'Q515'), gn: lit('Jinde') }] } } };
      return { body: { results: { bindings: [] } } };
    }
    if (url.startsWith('https://en.wikivoyage.org/w/index.php')) {
      return { body: '==See==\n[[Nudov]]\n==Go next==\n* [[Vyletov]] – hrad\n* [[Testov]]\n', headers: { 'content-type': 'text/x-wiki' } };
    }
    return { body: { query: { pages: [] } } };
  });
  try {
    const trips = await findTrips({ lat: 49.5, lon: 15.5 });
    const wvCall = stub.calls.find((c) => c.url.startsWith('https://en.wikivoyage.org/w/index.php'));
    assert.deepEqual([new URL(wvCall.url).searchParams.get('title'), new URL(wvCall.url).searchParams.get('action')], ['Testov', 'raw']);
    assert.match(wvCall.init.headers['User-Agent'], /^ATLAS-travel\//);
    const gnQuery = stub.calls.map((c) => c.url).find((u) => u.includes('query.wikidata.org') && decodeURIComponent(u).includes('VALUES ?gn'));
    assert.ok(decodeURIComponent(gnQuery).includes('"Vyletov"@en') && !decodeURIComponent(gnQuery).includes('"Testov"@en'), 'bez města samého');
    const vy = trips.find((t) => t.id === 'Q2');
    assert.equal(vy.why, 'Výlet doporučuje průvodce Wikivoyage');
    assert.ok(vy.score > trips.find((t) => t.id === 'Q3').score, 'doporučený před nedoporučeným');
    assert.ok(!trips.some((t) => t.id === 'Q9'), 'položka s jiným názvem článku ne');
    assert.ok(!('goNext' in vy) && vy.reach.carMin > 0);
  } finally {
    stub.restore();
  }
});

test('DEMO: vymyšlené výlety mají dosah i důvod', () => {
  const trips = mockTrips({ lat: 41.39, lon: 2.17 });
  assert.ok(trips.every((t) => t.reach && t.reach.transitMin > 0));
  assert.ok(trips.some((t) => t.why && t.why.includes('UNESCO')));
});
