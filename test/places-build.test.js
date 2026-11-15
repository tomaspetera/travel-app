// Vlastní seznam míst z GeoNames (scripts/build-places.mjs → data/places.json): čtení ZIPu bez knihoven, výběr míst
// a volba českého názvu – bez sítě (malý ZIP ve fixtures); a že vygenerovaný soubor odpovídá popsanému formátu
// a rozpočtu (~8 MB).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { zipLines, pickName, selectPlace, LINK, CS, EN } = await import('../scripts/build-places.mjs');
// skutečný ZIP (Python zipfile): stored.txt bez komprese s CRLF, alternateNames.txt deflate ve formátu GeoNames
const FIX = fileURLToPath(new URL('./fixtures/geonames-mini.zip', import.meta.url));

test('build-places: řádky souboru v ZIPu (deflate i bez komprese, CRLF, UTF-8), chybějící soubor = chyba', async () => {
  const lines = async (name, file = FIX) => {
    const out = [];
    for await (const l of zipLines(file, name)) out.push(l);
    return out;
  };
  assert.deepEqual(await lines('stored.txt'), ['a', 'b']);
  const alt = await lines('alternateNames.txt');
  assert.equal(alt.length, 4);
  assert.deepEqual(alt[1].split('\t').slice(1, 5), ['3164603', 'en', 'Venice', '1']);
  assert.deepEqual(alt.map((l) => l.split('\t')[3]), ['Benátky', 'Venice', 'Řezno', 'Kodaň']);
  assert.throws(() => zipLines(FIX, 'nic.txt'), /chybí nic\.txt/);
  // poškozená data (deflate je často „rozbalí“ bez chyby, bez komprese nepozná nic) → chyba podle CRC, ne tiché nesmysly
  const tmp = mkdtempSync(path.join(tmpdir(), 'atlas-zip-'));
  try {
    const bad = readFileSync(FIX);
    bad[bad.indexOf('a\r\nb\r\n')] = 0x63; // stored.txt: „a“ → „c“
    writeFileSync(path.join(tmp, 'bad.zip'), bad);
    await assert.rejects(lines('stored.txt', path.join(tmp, 'bad.zip')), /CRC nesedí/);
    assert.equal((await lines('alternateNames.txt', path.join(tmp, 'bad.zip'))).length, 4, 'nepoškozený soubor vedle projde');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('build-places: výběr – celé Česko, cities500 a slavná malá místa v Evropě, ve světě města a známé objekty', () => {
  const sel = (r, { eu = true, f = 0, n = 0 } = {}) => selectPlace({ fcl: 'P', fc: 'PPL', cc: 'IT', pop: 0, ...r }, eu, f, n);
  // Česko a Slovensko: každá obec i bez obyvatel (Pustevny); části měst a zaniklá místa nikdy
  assert.equal(sel({ cc: 'CZ' }), 'cz-sk obce');
  assert.equal(sel({ cc: 'CZ', fc: 'PPLX', pop: 5000 }), null);
  assert.equal(sel({ cc: 'SK', fc: 'PPLH' }), null);
  // hora jen s článkem na Wikipedii nebo českým jménem (Sněžka ano, bezejmenný kopec ne)
  assert.equal(sel({ cc: 'CZ', fcl: 'T', fc: 'MT' }), null);
  assert.equal(sel({ cc: 'CZ', fcl: 'T', fc: 'MT' }, { f: LINK }), 'cz-sk objekty');
  // Evropa: od 500 obyvatel nebo sídlo obce (Portofino PPLA3, 406 obyv.), menší jen s článkem, jmény a obyvateli
  assert.equal(sel({ fc: 'PPLA3', pop: 406 }), 'evropa cities500');
  assert.equal(sel({ pop: 779 }), 'evropa cities500');
  assert.equal(sel({ pop: 398 }), null);
  assert.equal(sel({ pop: 398 }, { f: LINK, n: 6 }), 'evropa malá místa'); // Manarola
  assert.equal(sel({ pop: 0 }, { f: LINK, n: 12 }), null, 'osada bez obyvatel jen se jmény z robotických wiki');
  // ostrov s článkem a jménem aspoň v jednom jazyce (Mljet), jen s odkazem ne
  assert.equal(sel({ fcl: 'T', fc: 'ISL' }, { f: LINK, n: 10 }), 'evropa objekty');
  assert.equal(sel({ fcl: 'T', fc: 'ISL' }, { f: LINK }), null);
  assert.equal(sel({ fcl: 'T', fc: 'ISL' }, { f: CS | EN, n: 2 }), 'evropa objekty');
  // svět: od 15 000 obyvatel, hlavní města a sídla krajů; objekty s článkem jen známé (Bali: 4,2 mil. obyvatel)
  const world = (r, o = {}) => sel({ cc: 'ID', ...r }, { eu: false, ...o });
  assert.equal(world({ pop: 14999 }), null);
  assert.equal(world({ pop: 15000 }), 'svět města');
  assert.equal(world({ fc: 'PPLA', pop: 300 }), 'svět města');
  assert.equal(world({ fcl: 'T', fc: 'ISL', pop: 4225384 }, { f: LINK, n: 2 }), 'svět objekty');
  assert.equal(world({ fcl: 'T', fc: 'MT' }, { f: LINK, n: 1 }), null);
  assert.equal(world({ fcl: 'T', fc: 'MT' }, { f: LINK, n: 5 }), 'svět objekty');
  assert.equal(world({ fcl: 'T', fc: 'MT' }, { f: CS, n: 5 }), null, 'bez článku na Wikipedii ne');
  // země, kam se jezdí na dovolenou: i menší letoviska s článkem, jménem a od 1000 obyvatel (Side 10 505, Ölüdeniz 2 748)
  const tr = (r, o = {}) => sel({ cc: 'TR', ...r }, { eu: false, ...o });
  assert.equal(tr({ pop: 10505 }, { f: LINK, n: 17 }), 'svět letoviska');
  assert.equal(tr({ pop: 999 }, { f: LINK, n: 17 }), null);
  assert.equal(tr({ pop: 10505 }, { n: 17 }), null, 'bez článku ne');
  assert.equal(tr({ pop: 10505 }, { f: LINK }), null, 'bez jména v žádném jazyce ne');
  assert.equal(sel({ cc: 'US', pop: 10505 }, { eu: false, f: LINK, n: 17 }), null, 'jinde ve světě dál od 15 000');
});

test('build-places: český název – preferovaný > jediný > shodný s hlavním > první, bez historických a hovorových', () => {
  const n = (name, o = {}) => ({ name, ...o });
  assert.equal(pickName([n('Benátky')], 'Venice'), 'Benátky');
  assert.equal(pickName([], 'Hallstatt'), 'Hallstatt');
  assert.equal(pickName([n('Gottwaldov', { hist: true }), n('Zlín', { pref: true })], 'Zlín'), 'Zlín');
  assert.equal(pickName([n('Gottwaldov', { hist: true })], 'Zlín'), 'Zlín');
  assert.equal(pickName([n('Velké jablko', { colloq: true }), n('New York')], 'New York City'), 'New York');
  // Salcburk i Salzburg bez preference → shodný s hlavním názvem (jako dnes Open-Meteo); hledá se podle obou
  assert.equal(pickName([n('Salzburg'), n('Salcburk')], 'Salzburg'), 'Salzburg');
  assert.equal(pickName([n('Salcburk'), n('Salcpurk')], 'Salzburg'), 'Salcburk');
  // u krajů celý název před zkráceným
  assert.equal(pickName([n('Ústecký', { pref: true, short: true }), n('Ústecký kraj', { pref: true })], 'Usti Region'), 'Ústecký kraj');
});

test('data/places.json: hlavička, formát řádků, rozpočet a Benátky', () => {
  const file = new URL('../data/places.json', import.meta.url);
  assert.ok(statSync(file).size < 8.5e6, `soubor ${statSync(file).size} B – rozpočet ~8 MB`);
  const d = JSON.parse(readFileSync(file, 'utf8'));
  assert.match(d.source, /^GeoNames \(CC BY 4\.0\)/);
  assert.deepEqual(d.cols, ['gid', 'name', 'lat', 'lon', 'admin1', 'pop', 'fc', 'n', 'en', 'keys']);
  assert.equal(d.fc[0], 'PPL');
  assert.ok(d.places.length > 150000, `${d.places.length} míst`);
  let gid = 0;
  let venice = null;
  for (const r of d.places) {
    const f = r.split('|');
    assert.ok(f.length >= 6 && f.length <= 10 && f[f.length - 1] !== '', r);
    assert.ok(Number(f[0]) > 0, `řádky seřazené podle ID: ${r}`);
    gid += Number(f[0]);
    if (f[1] === 'Benátky' && d.admin1[f[4]][0] === 'IT') venice = { gid, f };
  }
  assert.equal(venice.gid, 3164603);
  const [, name, lat, lon, a1, pop, fc, , en, keys] = venice.f;
  assert.deepEqual([name, Number(lat) / 1e4, Number(lon) / 1e4, d.admin1[a1][1], d.fc[fc], en], ['Benátky', 45.4371, 12.3326, 'Benátsko', 'PPLA', 'Venice']);
  assert.ok(Number(pop) > 50000);
  assert.ok(['benatky', 'venice', 'venezia', 'venedig', 'wenecja'].every((k) => keys.split(',').includes(k)), keys);
});
