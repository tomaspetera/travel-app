// Hledání míst z vlastního seznamu (data/places.json z GeoNames – server/lib/places.js geocode a englishName): povinná
// místa ze zadání s českým názvem, anglické názvy pro partnery ubytování, tvar výsledku a ID jako dřív z Open-Meteo
// (uložené cesty a hlídání cen je mají v sobě) a pořadí výsledků. Bez sítě.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stubFetch } from './helpers.js';

const { geocode, englishName } = await import('../server/lib/places.js');
const { MUST } = await import('../scripts/build-places.mjs');
const names = (list) => list.map((p) => `${p.label} ${p.cc}`);

test('povinná místa: první nebo mezi prvními 3 (Toledo ES i US mezi výsledky), s českým názvem, kde ho GeoNames má', async () => {
  const stub = stubFetch(() => ({ status: 500, body: {} }));
  try {
    const bad = [];
    for (const [q, label, cc, en, top = 3] of MUST) {
      const hits = await geocode(q);
      const rank = hits.findIndex((p) => p.label === label && p.cc === cc) + 1;
      const p = hits[rank - 1];
      if (!rank || rank > top) bad.push(`${q} → ${names(hits).join('; ')}`);
      else if (en && (await englishName(p.label, p.lat, p.lon, p.cc, p.gid)) !== en) bad.push(`${q}: anglicky ne ${en}`);
    }
    assert.deepEqual(bad, []);
    for (const q of ['Benátky', 'Mnichov', 'Řezno', 'Drážďany', 'Kolín nad Rýnem', 'Vratislav', 'Soluň', 'Lublaň', 'Vídeň', 'Krakov', 'Kodaň', 'Praha',
      'Hallstatt', 'Portofino', 'Manarola', 'Sveti Stefan', 'Pustevny', 'Kvilda', 'Sněžka', 'Lysá hora', 'Mljet', 'Triglav',
      'Side', 'Göreme', 'Dahab', 'Marsa Alam', 'Ölüdeniz']) {
      assert.equal((await geocode(q))[0]?.label, q, `${q} první`);
    }
    assert.equal(stub.calls.length, 0, 'bez sítě');
  } finally {
    stub.restore();
  }
});

test('anglický název pro partnery ubytování: podle ID GeoNames i podle českého či slovenského jména do 25 km', async () => {
  for (const [cs, en] of [['Benátky', 'Venice'], ['Mnichov', 'Munich'], ['Kodaň', 'Copenhagen'], ['Boloňa', 'Bologna']]) {
    const [p] = await geocode(cs);
    assert.equal(await englishName(p.label, p.lat, p.lon, p.cc, p.gid), en, `${cs} podle ID`);
    assert.equal(await englishName(cs, p.lat + 0.05, p.lon, p.cc), en, `${cs} podle jména kousek vedle`);
  }
  assert.equal(await englishName('Benátky', 45.44, 12.33, 'FR'), null, 'jiná země');
  assert.equal(await englishName('Benátky', 45.9, 12.33, 'IT'), null, 'dál než 25 km');
  // bez ID jen přesný název a obec před hradem stejného jména – u středu města ne Dublin Castle, Berliner Stadtschloss
  // ani městský obvod Marseille 02
  assert.equal(await englishName('Dublin', 53.3498, -6.2603, 'IE'), 'Dublin');
  assert.equal(await englishName('Berlín', 52.52, 13.405, 'DE'), 'Berlin');
  assert.equal(await englishName('Marseille', 43.2965, 5.3698, 'FR'), 'Marseille');
  assert.equal(await englishName('Bombaj', 18.97, 72.83, 'IN'), 'Mumbai', 'i podle historického jména');
});

test('výsledek: stejný tvar a ID jako dřív z Open-Meteo, kraj a země česky (i území mimo countries.json)', async () => {
  assert.deepEqual((await geocode('Benátky'))[0], {
    id: 'geo:45.4371,12.3326|Benátky', type: 'place', label: 'Benátky', flag: '🇮🇹', sub: 'Benátsko, Itálie', cc: 'IT',
    lat: 45.4371, lon: 12.3326, gid: 3164603, pop: 51298, fc: 'PPLA',
  });
  // poloha 49,22645 / 17,67065: zaokrouhlená jako toFixed(4) u Open-Meteo (Math.round by dal 49,2265 – jiné ID)
  assert.equal((await geocode('Zlín'))[0].id, 'geo:49.2264,17.6706|Zlín');
  assert.equal((await geocode('Tórshavn'))[0].sub, 'Streymoy, Faerské ostrovy');
  assert.deepEqual(await geocode('B'), []);
});

test('pořadí: přesný název před začátkem jiného (i většího), ale velké město před vesnicí, která se jmenuje jako napsaný začátek', async () => {
  const first = async (q) => names(await geocode(q))[0];
  assert.equal(await first('Most'), 'Most CZ', 'Most před Móstoles');
  assert.equal(await first('Kolín'), 'Kolín CZ', 'Kolín před Kolínem nad Rýnem');
  assert.equal(await first('Tábor'), 'Tábor CZ', 'Tábor před Taborou v Tanzanii');
  assert.equal(await first('Pař'), 'Paříž FR', 'ne Par v Cornwallu (přesně „par“)');
  assert.deepEqual(names(await geocode('Dub')).slice(0, 2), ['Dubaj AE', 'Dublin IE'], 'ne vesnice Dub');
  // dva znaky: jen přesný název (jako dřív Open-Meteo), ne všechno na „Br…“
  assert.deepEqual(await geocode('Br'), []);
  assert.deepEqual(names(await geocode('Ub')), ['Ub RS']);
  // obec na ostrově stejného jména první (střed města pro program a ubytování), slavný ostrov před vzdáleným jmenovcem
  assert.deepEqual((await geocode('Ibiza')).map((p) => p.fc), ['PPLA3', 'ISL']);
  assert.deepEqual((await geocode('Hvar')).slice(0, 2).map((p) => p.fc), ['PPLA2', 'ISL']);
  assert.equal(await first('Bali'), 'Bali ID');
  assert.equal(await first('Malta'), 'Malta MT');
  // přesný název osady před větší obcí, která jím jen začíná; velký ostrov nepřebije město (Pula, ne Jáva přes
  // indonéské „Pulau Jawa“; Santo Domingo, ne ostrov Hispaniola se stejným španělským jménem)
  assert.equal(await first('Zadov'), 'Zadov CZ', 'ne Žádovice');
  assert.equal(await first('Pula'), 'Pula HR');
  assert.equal(await first('Santo Domingo'), 'Santo Domingo DO');
  // stejnojmenné obce podle velikosti (Lhota s 782 obyvateli před osadami Lhota bez obyvatel)
  assert.equal((await geocode('Lhota'))[0].pop, 782);
  // nejvýš 3 osady téhož jména, dokud jsou jiné – město, které se teprve píše, v nabídce zůstane
  for (const [q, town] of [['Hradec', 'Hradec Králové CZ'], ['Ústí', 'Ústí nad Labem CZ'], ['Veselí', 'Veselí nad Moravou CZ']]) {
    const hits = names(await geocode(q));
    assert.ok(hits.includes(town), `${q}: ${hits.join('; ')}`);
    assert.equal(hits.filter((h) => h.startsWith(`${q} `) && h.split(' ').length === 2).length, 3, `${q}: tři osady`);
  }
  assert.equal(await first('Valtice'), 'Valtice CZ', 'ne „valtice“ malým písmenem z GeoNames');
});

test('historická a hovorová jména jen celá: Bombaj najde Mumbai, ale „madr“ Madrid, ne Čennaí (dřív Madras)', async () => {
  assert.equal(names(await geocode('Bombaj'))[0], 'Mumbai IN');
  assert.equal(names(await geocode('madr'))[0], 'Madrid ES');
  assert.ok(!names(await geocode('bena')).includes('Varanasi IN'), 'Benares');
  assert.ok(!names(await geocode('New York')).includes('Jakarta ID'), '„New York Van Java“');
  assert.ok(!names(await geocode('Roma')).includes('Murmansk RU'), 'Romanov');
});
