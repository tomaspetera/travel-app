// Našeptávač míst: přesná shoda, velikost místa, vzdálenost od domova, město „a letiště v okolí“, geokódování (vlastní
// seznam míst z GeoNames, data/places.json) jen jako doplněk bez vzdálených jmenovců a vesnic.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { suggest, localSuggestions, resolveOrigins, resolveDestinations, homePoint, geocodePlaces } = await import('../server/lib/places.js');
const ids = (list) => list.map((s) => s.id.split('|')[0]);
const BRNO = 'geo:49.1952,16.6080';

test('suggest: „Toledo“ najde i Toledo ve Španělsku (bližší než Ohio), „Brno“ = město a letiště, bez vesnic a jmenovců', async () => {
  const t = await suggest('Toledo');
  assert.equal(t[0].cc, 'ES', 'Toledo ve Španělsku první (nejblíž domovu), i když v GeoNames je Toledo v Ohiu větší');
  assert.equal(t[0].type, 'city');
  assert.ok(t.some((s) => s.id === 'ap:TOL'), 'letiště Toledo (USA) zůstává');
  // (Toledo na Filipínách má 200 tisíc obyvatel – je v návrzích jako dřív u Open-Meteo, až za Španělskem)
  // čtvrti (Brno-střed), hora Brno v Plzeňském kraji a vesnice pryč
  assert.deepEqual(ids(await suggest('Brno')), ['ap:BRQ', BRNO], 'Kam: letiště, pak město');
  assert.deepEqual(ids(await suggest('Brno', { role: 'from' })), [BRNO, 'ap:BRQ'], 'Odkud: město (okruh letišť) první');
  const z = await suggest('Zli', { role: 'from', near: 'ap:BRQ' });
  assert.equal(z[0].label, 'Zlín', 'Zlín před větším Zlitánem v Libyi');
  // z geokódování ne jmenovci místa z vlastních dat (vesnice Mnichov v Česku) ani malá místa daleko od domova
  // (Bleddfa Castle ve Walesu u „Bled“)
  assert.ok(!(await suggest('Mnichov')).some((s) => s.cc === 'CZ'), 'jmenovci – vesnice Mnichov v Česku – ne');
  const bled = await suggest('Bled');
  assert.equal(bled[0].label, 'Bled');
  assert.ok(!bled.some((s) => s.cc === 'GB'), 'malá vzdálená místa ne');
});

test('localSuggestions: začátek názvu před kódem letiště, velké a blízké první, vzdálené drobnosti pryč', () => {
  const L = (q, o) => ids(localSuggestions(q, 8, o));
  assert.deepEqual(L('Pra').slice(0, 2), ['ap:PRG', 'geo:50.0880,14.4208'], '„Pra“ = Praha, ne Paraná (PRA)');
  assert.equal(L('PRA')[0], 'ap:PRA', 'kód velkými písmeny = letiště');
  assert.equal(L('USA')[0], 'cc:US', 'USA = země, ne letiště Concord');
  assert.equal(L('Ost')[0], 'ap:OSR', 'Ostrava před Ostende (OST)');
  assert.ok(!L('Ost').some((x) => x.startsWith('rg:') || x.startsWith('cc:')), '„Ost“ ≠ ostrovy');
  assert.equal(L('Bang')[0], 'metro:BKK');
  assert.ok(!L('Bang').some((x) => x === 'ap:FKI' || x === 'ap:LBP'), 'Kisangani (BANGoka) ani Long Banga');
  assert.ok(!L('Lond').includes('ap:LNV'), 'Londolovit (Papua) ne');
  assert.ok(!L('Londýn').includes('ap:YXU'), 'London v Kanadě ne');
  assert.equal(L('Br', { home: homePoint('ap:BRQ'), role: 'from' }).indexOf(BRNO) < 6, true, 'z Brna je Brno mezi prvními');
});

test('město „a letiště v okolí“: Odkud = okruh ze středu, Kam = vlastní + velká blízká letiště', () => {
  const brno = localSuggestions('Brno', 8, { role: 'from' })[0];
  assert.equal(brno.type, 'city');
  assert.match(brno.sub, /BRQ, VIE, BTS/);
  const o = resolveOrigins([brno.id], { radiusKm: 200 }).airports.map((a) => a.iata);
  for (const c of ['BRQ', 'VIE', 'BTS', 'PRG']) assert.ok(o.includes(c), c);
  assert.deepEqual(resolveDestinations([brno.id]).airports, ['BRQ', 'VIE', 'BTS', 'OSR'], 'ne Pardubice před Vídní');
  assert.equal(resolveDestinations([brno.id]).label, 'Brno');
});

test('suggest: kódy letišť malými, cizí názvy měst, malá turistická místa, země bez letiště, okruh 0 u města', async () => {
  // kód psaný malými nebo s velkým prvním písmenem (klávesnice telefonu) letiště nesmí schovat
  for (const [q, id] of [['boj', 'ap:BOJ'], ['Boj', 'ap:BOJ'], ['mah', 'ap:MAH'], ['tia', 'ap:TIA'], ['cia', 'ap:CIA'], ['gro', 'ap:GRO'], ['bod', 'ap:BOD']]) {
    assert.equal(localSuggestions(q, 8)[0].id, id, q);
  }
  assert.ok(localSuggestions('bri', 8).some((s) => s.id === 'ap:BRI'), 'bri = Bari');
  assert.deepEqual(ids(localSuggestions('nyc', 3)), ['metro:NYC']);
  assert.deepEqual(ids(localSuggestions('bcn', 2)), ['ap:BCN', 'metro:BCN'], 'letiště podle kódu před metropolí');
  // země bez letiště jen při přesné shodě
  assert.notEqual(localSuggestions('An', 3)[0].id, 'cc:AD');
  assert.notEqual(localSuggestions('Pal', 3)[0].id, 'cc:PS');
  assert.equal(localSuggestions('Monako', 3)[0].id, 'cc:MC');
  // země a velká letiště shodou slova uvnitř názvu
  assert.ok(localSuggestions('Lanka', 8).some((s) => s.id === 'cc:LK'));
  assert.ok(localSuggestions('Cana', 8).some((s) => s.id === 'ap:LPA'));
  assert.equal(localSuggestions('Wrocław', 3)[0].id, 'ap:WRO');
  // dvojice město + letiště zůstane na vyšším místě: v Odkud z Brna je Brno první
  assert.equal(localSuggestions('Br', 8, { home: homePoint('ap:BRQ'), role: 'from' })[0].id.split('|')[0], BRNO);
  // okruh 0 u města: jeho letiště, ne druhé vzdálené
  const og = (id, r) => resolveOrigins([id], { radiusKm: r }).airports.map((a) => a.iata);
  assert.deepEqual(og('geo:49.1952,16.6080|Brno', 0), ['BRQ']);
  assert.deepEqual(og('geo:48.1374,11.5755|Mnichov', 25), ['MUC']);
  assert.equal(og('geo:49.2265,17.6707|Zlín', 0).length, 2, 'město bez letiště: dvě nejbližší');

  const first = async (q) => (await suggest(q))[0]?.label;
  assert.equal(await first('Munchen'), 'Mnichov', 'cizí název → české jméno velkého města');
  assert.equal(await first('Koln'), 'Kolín nad Rýnem');
  assert.equal(await first('Beograd'), 'Bělehrad');
  assert.equal(await first('Den Haag'), 'Haag', 'sídlo vlády (GeoNames PPLG) jako velké město');
  assert.equal(await first('Agia Napa'), 'Ayia Napa', 'liší se jedním písmenem (shoda podle jiného jména v GeoNames)');
  const sz = await suggest('Salzburg');
  assert.equal(sz.filter((s) => s.type === 'city').length, 1, 'Salcburk jen jednou (anglický název = duplikát)');
  // město není čtvrtí osady stejného začátku do 25 km (osada Jablonec u Jablonce nad Nisou); čtvrti Brna dál pryč
  assert.ok((await suggest('Jablonec', { role: 'from' })).some((s) => s.label === 'Jablonec nad Nisou'), 'Jablonec nad Nisou');
  assert.ok(!(await suggest('Brn')).some((s) => /^Brno-/.test(s.label)), 'bez čtvrtí Brna');
  assert.ok((await suggest('Portofino')).some((s) => s.label === 'Portofino'), 'malé turistické místo, když nic jiného nesedí');
  const pl = (await suggest('Plitvice')).map((s) => s.label);
  assert.ok(pl.includes('Plitvice Lakes National Park'), pl.join(', '));
});

test('suggest: místní názvy velkých cílů (Roma, Wien, Lisboa…) vedou na metropoli nebo letiště, ne na jmenovce jinde', () => {
  const first = (q) => localSuggestions(q, 3)[0]?.id;
  assert.equal(first('Roma'), 'metro:ROM');
  assert.equal(first('Wien'), 'ap:VIE');
  assert.equal(first('Lisboa'), 'ap:LIS');
  assert.equal(first('Napoli'), 'ap:NAP');
  assert.equal(first('Firenze'), 'ap:FLR');
  assert.equal(first('Amsterodam'), 'ap:AMS');
  assert.equal(first('Athény'), 'ap:ATH');
  assert.equal(first('München'), 'ap:MUC');
  // Roma v Austrálii (letiště RMA) mezi návrhy není
  assert.ok(!localSuggestions('Roma', 8).some((s) => s.id === 'ap:RMA'));
});

test('suggest: pevninské oblasti (Toskánsko, Apulie, Istrie…) s vlajkou země; návrhy nesou anglický/místní název', () => {
  const first = (q) => localSuggestions(q, 3)[0];
  assert.deepEqual([first('Toskánsko').id, first('Toskánsko').flag], ['rg:toskansko', '🇮🇹']);
  assert.equal(first('Toscana').id, 'rg:toskansko');
  assert.equal(first('Puglia').id, 'rg:apulie');
  assert.equal(first('Istrie').id, 'rg:istrie');
  assert.ok(first('Toscana').aliases.includes('toscana'));
  // en: chytré hledání pozná „Rome“ u Říma
  assert.equal(localSuggestions('Rome', 3).find((s) => s.id === 'metro:ROM').en, 'Rome');
});

test('suggest: překlepy („Barcleona“, „Lodnýn“, „Egpyt“, „Mallroca“) najdou místo s příznakem fuzzy; skutečné názvy ne', () => {
  const first = (q) => localSuggestions(q, 3)[0];
  for (const [q, id] of [['Barcleona', 'metro:BCN'], ['Lodnýn', 'metro:LON'], ['Egpyt', 'cc:EG'], ['Bankok', 'metro:BKK'], ['Chorvatkso', 'cc:HR'], ['Barcleo', 'metro:BCN']]) {
    assert.equal(first(q)?.id, id, q);
    assert.equal(first(q).fuzzy, true, q);
  }
  // přesná nebo začínající shoda bez fuzzy; krátké slovo (Brna) ani jiné první písmeno opravu nedostanou
  assert.ok(!localSuggestions('Barcelona', 5).some((s) => s.fuzzy));
  assert.equal(localSuggestions('Krta', 5).length, 0);
  assert.ok(!localSuggestions('Arcelona', 5).some((s) => s.fuzzy));
  // dva překlepy až od 9 znaků (Makarska ≠ Maďarsko)
  assert.ok(!localSuggestions('Makarska', 5).some((s) => s.id === 'cc:HU'));
});

test('suggest: skutečné místo z geokódování (vesnice Venecia na Slovensku) před opravou překlepu', async () => {
  const list = await suggest('Venecia', { near: 'ap:PRG' });
  assert.deepEqual([list[0].id.split('|')[1], list[0].cc], ['Venecia', 'SK']);
  assert.ok(list.some((s) => s.id === 'metro:VCE' && s.fuzzy), 'Benátky jako oprava překlepu hned za ní');
});

test('geocodePlaces (Objevuj): překlep „Krakv“ = Krakov nahoře (geokodér by našel ostrov Kråkvåg)', async () => {
  const k = await geocodePlaces('Krakv');
  assert.deepEqual([k[0].label, k[0].fuzzy, k[0].type, k[0].cc, k[1].label], ['Krakov', true, 'place', 'PL', 'Kråkvåg']);
  // správně napsané: bez opravy
  assert.ok(!(await geocodePlaces('Lisabon')).some((x) => x.fuzzy));
  const l = await geocodePlaces('Porto');
  assert.deepEqual([l[0].label, l[0].cc], ['Porto', 'PT']);
  assert.match(l[0].id, /^geo:/);
});

test('geocodePlaces: překlep „Amstrdam“ = Amsterodam v Nizozemsku, ne stejnojmenné městečko v USA', async () => {
  const a = (await geocodePlaces('Amstrdam'))[0];
  assert.deepEqual([a.label, a.cc, a.fuzzy], ['Amsterodam', 'NL', true]);
  assert.ok(Math.abs(a.lat - 52.37) < 0.1 && Math.abs(a.lon - 4.89) < 0.1, `${a.lat}, ${a.lon}`);
});

test('suggest: víceslovný název ve 2. pádě („Velké Británie“, „Nového Zélandu“, „Spojených států“) – shoda podle kmenů, ne překlep', () => {
  const first = (q) => localSuggestions(q, 3)[0];
  for (const [q, id] of [['Velké Británie', 'cc:GB'], ['Nového Zélandu', 'cc:NZ'], ['Spojených států', 'cc:US'], ['Jižní Afriky', 'cc:ZA'], ['Kanárských ostrovů', 'rg:kanary'], ['Spojených arabských emirátů', 'cc:AE']]) {
    assert.equal(first(q)?.id, id, q);
    assert.ok(!first(q).fuzzy, q);
    assert.ok(first(q).aliases.includes(q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')), q); // chytré hledání pozná shodu
  }
  // jiný kmen = jiné místo (Jižní Afriky ≠ Jižní Amerika)
  assert.ok(!localSuggestions('Jižní Afriky', 5).some((s) => /Amerika/.test(s.label)));
});
