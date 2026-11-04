// Kontrola dat v data/*.json, která jiné testy nepokrývají: země (countries.json – povinná pole, duplicity, rozsahy,
// měny eurozóny), shoda měn se zemí letiště v tabulce cesty z letiště do města (arrival.json) a databáze letišť
// (airports.json, airport-pax.json). Vstupní podmínky, podnebí a arrival.json samotné kontrolují entry/climate/arrival.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const COUNTRIES = read('countries.json');
const ARRIVAL = read('arrival.json');
const AIRPORTS = read('airports.json');
const PAX = read('airport-pax.json');
const BY = Object.fromEntries(COUNTRIES.map((c) => [c.iso2, c]));

const CONT = ['Evropa', 'Asie', 'Afrika', 'Severní Amerika', 'Jižní Amerika', 'Oceánie'];
// Eurozóna (Bulharsko od 1. 1. 2026) a státy, které euro používají bez členství (Andorra, Monako, San Marino,
// Černá Hora, Kosovo) – měna v detailu země a „trochu hotovosti“ v přípravě na cestu.
const EURO = ['AT', 'BE', 'BG', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK',
  'AD', 'MC', 'SM', 'ME', 'XK'];

test('countries.json: povinná pole, typy a rozsahy každé země', () => {
  for (const c of COUNTRIES) {
    const at = c.iso2;
    assert.match(c.iso2, /^[A-Z]{2}$/, `${at}: iso2`);
    assert.match(c.m49, /^\d{3}$/, `${at}: m49`);
    for (const k of ['en', 'cs', 'cap', 'blurb']) assert.ok(typeof c[k] === 'string' && c[k].trim().length > 1, `${at}: ${k}`);
    assert.ok(c.capCs === undefined || (typeof c.capCs === 'string' && c.capCs.length > 1 && c.capCs !== c.cap), `${at}: capCs`);
    assert.equal(typeof c.geo, 'string', `${at}: geo`);
    assert.ok(CONT.includes(c.cont), `${at}: světadíl ${c.cont}`);
    for (const k of ['cost', 'safety']) assert.ok(Number.isInteger(c[k]) && c[k] >= 1 && c[k] <= 5, `${at}: ${k} ${c[k]}`);
    assert.ok(Array.isArray(c.months) && c.months.length >= 1 && c.months.length <= 12, `${at}: měsíce`);
    assert.ok(c.months.every((m) => Number.isInteger(m) && m >= 1 && m <= 12) && new Set(c.months).size === c.months.length, `${at}: měsíce ${c.months}`);
    assert.match(c.cur, /^[A-Z]{3}$/, `${at}: měna`);
    assert.ok(Array.isArray(c.tags) && c.tags.length >= 1 && c.tags.every((t) => typeof t === 'string' && t.length > 1), `${at}: štítky`);
    // varování MZV v „geo“ jen u zemí s horší bezpečností a naopak – země s nejhorší bezpečností varování mají
    if (c.safety <= 2) assert.ok(c.geo.length > 0, `${at}: bezpečnost ${c.safety} bez upozornění`);
  }
});

test('countries.json: žádné duplicity (kód, M49, názvy)', () => {
  for (const k of ['iso2', 'm49', 'en', 'cs']) {
    const vals = COUNTRIES.map((c) => c[k]);
    assert.deepEqual(vals.filter((v, i) => vals.indexOf(v) !== i), [], `duplicitní ${k}`);
  }
});

test('countries.json: země platící eurem mají měnu EUR (Bulharsko od 1. 1. 2026)', () => {
  for (const iso of EURO) assert.equal(BY[iso]?.cur, 'EUR', iso);
  // zbylé „EUR“ jsou jen výjimky, o kterých víme (KLDR: cizinci platí eurem, místní won nesmí směnit)
  assert.deepEqual(COUNTRIES.filter((c) => c.cur === 'EUR' && !EURO.includes(c.iso2)).map((c) => c.iso2), ['KP']);
});

// Kontrola 10/2026 u ~40 zemí, kam Češi jezdí nejčastěji – opravy se zdrojem, ať se nevrátí:
// - cenová hladina (tečky, Česko = 2): Eurostat prc_ppp_ind, restaurace a hotely 2024 (EU = 100): Česko 74, Španělsko 84,
//   Řecko 86, Chorvatsko 95, Itálie 107, Rakousko a Francie 110, Norsko 140, Dánsko 148, Island 167, Švýcarsko 171 →
//   Itálie 3 → 4 (blíž Rakousku než Španělsku), Dánsko 4 → 5 (dražší než Norsko)
// - bezpečnost a upozornění: MZV ČR, Přehled upozornění na cesty a stránky států „Cestování“ (23. 10. 2026) – Egypt bez
//   aktuálního varování (výhrady jen k Sinaji mimo silnice, hranici s Libyí a střednímu Egyptu) 3 → 4; nová upozornění
//   Francie (protesty, 21. 10. 2026), Island (sopky), Kanada (požáry), USA (hurikány na Floridě, u Mexického zálivu a na Havaji, požáry na západě), Maroko, Indonésie (Papua),
//   Dominikánská republika (hurikány červen–listopad); Thajsko: varování jen pro pohraničí s Kambodžou, jih „zvýšená
//   opatrnost“ (dřív „nejezdi“); Jordánsko: bez neověřených „útoků u Akaby“
// - nejlepší měsíce: Rakousko i leden–březen (lyže), Srí Lanka i prosinec (západ a jih: Kolombo v prosinci 131 mm srážek,
//   v březnu 105 mm – data/climate.json)
test('countries.json: opravy cen, bezpečnosti a sezón z kontroly 10/2026 (Eurostat, MZV ČR)', () => {
  assert.equal(BY.IT.cost, 4);
  assert.equal(BY.DK.cost, 5);
  assert.ok(BY.DK.cost >= BY.NO.cost && BY.IT.cost === BY.AT.cost && BY.IT.cost > BY.ES.cost);
  assert.equal(BY.EG.safety, 4);
  assert.match(BY.EG.geo, /Sinaj.*Libyí|Libyí.*Sinaj/);
  for (const cc of ['FR', 'IS', 'CA', 'US', 'MA', 'ID', 'DO']) assert.match(BY[cc].geo, /Ověř aktuální situaci\.$/, cc);
  assert.match(BY.TH.geo, /Kambodž/);
  assert.doesNotMatch(BY.TH.geo, /Nejezdi .*Yala/);
  assert.doesNotMatch(BY.JO.geo, /Akab/);
  for (const m of [1, 2, 3, 7]) assert.ok(BY.AT.months.includes(m), `Rakousko ${m}`);
  assert.ok(BY.LK.months.includes(12));
  // země, kam MZV ČR doporučuje jen nezbytné cesty nebo před nimi varuje (SAE, Jordánsko, Kuba), mají bezpečnost 1–2
  assert.ok(BY.AE.safety <= 2 && BY.JO.safety <= 2 && BY.CU.safety === 1);
  // USA: hurikány hrozí hlavně na Floridě a u Mexického zálivu (a na Havaji), na západě požáry – ne „hurikány na západě“
  assert.match(BY.US.geo, /Florid.*Mexického zálivu.*Havaj.*na západě USA v létě lesní požáry/);
  assert.doesNotMatch(BY.US.geo, /západě[^;]*hurikán/);
});

test('countries.json: hlavní město Řecka jako v celé aplikaci (server/lib/names.js: Athens → Atény)', () => {
  assert.equal(BY.GR.capCs, 'Atény');
});

// sight-hours.json psal Akropoli do „Athén“ – památka v hlavním městě nese jeho český název z countries.json
test('sight-hours.json: památky v hlavních městech mají město stejně jako countries.json', () => {
  const R = 6371, rad = Math.PI / 180;
  const km = (a, b, c, d) => 2 * R * Math.asin(Math.sqrt(Math.sin((c - a) * rad / 2) ** 2 + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin((d - b) * rad / 2) ** 2));
  let n = 0;
  for (const s of read('sight-hours.json').sights) {
    const c = COUNTRIES.find((x) => km(s.lat, s.lon, ...x.capLL) < 15);
    if (!c) continue;
    n++;
    assert.equal(s.city, c.capCs || c.cap, s.name);
  }
  assert.ok(n >= 20, `památek v hlavních městech: ${n}`);
});

test('countries.json: poloha hlavního města (capLL) u každé země – počasí v okně země jedním dotazem a ve správné zemi', () => {
  const R = 6371, rad = Math.PI / 180;
  const km = (a, b, c, d) => 2 * R * Math.asin(Math.sqrt(Math.sin((c - a) * rad / 2) ** 2 + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin((d - b) * rad / 2) ** 2));
  for (const c of COUNTRIES) {
    const [lat, lon] = c.capLL || [];
    assert.ok(Array.isArray(c.capLL) && c.capLL.length === 2 && Math.abs(lat) <= 90 && Math.abs(lon) <= 180, `${c.iso2}: capLL ${JSON.stringify(c.capLL)}`);
    // hlavní město leží u letiště své země (bez letiště v datech: Andorra, Lichtenštejnsko, Monako, San Marino, Palestina, Ukrajina)
    const aps = AIRPORTS.filter((a) => a[3] === c.iso2);
    if (aps.length) assert.ok(Math.min(...aps.map((a) => km(lat, lon, a[4], a[5]))) < 120, `${c.iso2} ${c.cap}: daleko od letišť své země`);
  }
  // geokódování jen podle názvu vracelo San José v Kalifornii a Vitórii v Brazílii
  assert.ok(km(...BY.CR.capLL, 9.93, -84.08) < 10, 'Kostarika: San José v Kostarice');
  assert.ok(km(...BY.SC.capLL, -4.62, 55.45) < 10, 'Seychely: Victoria na Mahé');
  assert.ok(km(...BY.PA.capLL, 8.99, -79.52) < 10, 'Panama: Panama City v Panamě, ne na Floridě');
  assert.ok(km(...BY.CZ.capLL, 50.09, 14.42) < 10);
});

test('arrival.json: jízdné v měně země letiště (stejně jako countries.json)', () => {
  const cc = Object.fromEntries(AIRPORTS.map((a) => [a[0], a[3]]));
  // Marsa Alam: veřejná doprava nejezdí, soukromé transfery se v Egyptě nabízejí v eurech
  const OTHER = { RMF: 'EUR' };
  const bad = [];
  for (const [iata, x] of Object.entries(ARRIVAL.airports)) {
    const c = BY[cc[iata]];
    assert.ok(c, `${iata}: země ${cc[iata]} je v countries.json`);
    if (x.cur !== (OTHER[iata] || c.cur)) bad.push(`${iata}:${x.cur}≠${c.cur}`);
    if (x.taxi && x.taxi.cur !== c.cur) bad.push(`${iata} taxi:${x.taxi.cur}≠${c.cur}`);
  }
  assert.deepEqual(bad, []);
});

test('airports.json a airport-pax.json: unikátní IATA, platné souřadnice, typ a časové pásmo; cestující jen u známých letišť', () => {
  const seen = new Set();
  for (const a of AIRPORTS) {
    const [iata, name, city, cc, lat, lon, type, tz] = a;
    assert.equal(a.length, 8, `${iata}: počet polí`);
    assert.match(iata, /^[A-Z0-9]{3}$/, `IATA ${iata}`);
    assert.ok(!seen.has(iata), `${iata}: duplicitní`);
    seen.add(iata);
    assert.ok(typeof name === 'string' && name.length > 1 && typeof city === 'string' && city.length > 0, `${iata}: název a město`);
    assert.match(cc, /^[A-Z]{2}$/, `${iata}: země`);
    assert.ok(Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lon) && Math.abs(lon) <= 180 && (lat !== 0 || lon !== 0), `${iata}: ${lat}, ${lon}`);
    assert.ok(['L', 'M', 'S'].includes(type), `${iata}: typ ${type}`);
    assert.ok(typeof tz === 'string' && /^[A-Za-z_]+\/[A-Za-z_\-/]+$/.test(tz), `${iata}: pásmo ${tz}`);
  }
  for (const a of AIRPORTS) assert.ok(!/\s{2}|^\s|\s$/.test(a[1]) && !/\s{2}|^\s|\s$/.test(a[2]), `${a[0]}: mezery v názvu „${a[1]}“ / „${a[2]}“`);
  for (const [iata, v] of Object.entries(PAX)) {
    assert.ok(seen.has(iata), `${iata}: cestující u letiště, které není v airports.json`);
    assert.ok(Array.isArray(v) && v.length === 2 && Number.isFinite(v[0]) && v[0] >= 0 && Number.isInteger(v[1]) && v[1] >= 1990 && v[1] <= 2026, `${iata}: ${v}`);
  }
});

// Pár letišť mělo město a časové pásmo z jiného letiště se stejným kódem (Aral v Číně: „Brisbane“, Australia/Brisbane;
// Amravati v Indii: „Alverca“, Europe/Lisbon) – časy letů vycházely o hodiny vedle a hledání „Brisbane“ by našlo Čínu.
// Pásmo musí sedět na zeměpisnou délku (sluneční čas ± 3,5 h – vejde se i Sin-ťiang s pekingským časem) a evropská pásma patří jedné zemi (Ženeva má Europe/Zurich jako ostatní švýcarská letiště).
test('airports.json: časové pásmo a město odpovídají poloze letiště', () => {
  const offs = new Map();
  const off = (tz) => {
    if (!offs.has(tz)) {
      const s = new Intl.DateTimeFormat('en', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(new Date('2026-01-15T12:00:00Z')).find((p) => p.type === 'timeZoneName').value;
      const m = s.match(/GMT(?:([+-])(\d\d):(\d\d))?/);
      offs.set(tz, m[1] ? (m[1] === '-' ? -1 : 1) * (+m[2] + m[3] / 60) : 0);
    }
    return offs.get(tz);
  };
  const bad = [];
  for (const [iata, , , cc, , lon, , tz] of AIRPORTS) {
    let d = Math.abs(off(tz) - lon / 15);
    d = Math.min(d, 24 - d);
    if (d > 3.5) bad.push(`${iata} ${cc} ${tz}`);
  }
  assert.deepEqual(bad, []);
  const euro = {};
  for (const a of AIRPORTS) if (a[7].startsWith('Europe/')) (euro[a[7]] ||= new Set()).add(a[3]);
  // Kosovo patří do pásma Europe/Belgrade
  const shared = Object.entries(euro).filter(([tz, s]) => s.size > 1 && tz !== 'Europe/Belgrade').map(([tz, s]) => `${tz}: ${[...s]}`);
  assert.deepEqual(shared, []);
  const AP = Object.fromEntries(AIRPORTS.map((a) => [a[0], a]));
  const fixed = { AAP: ['Samarinda', 'Asia/Makassar'], ACF: ['Aral', 'Asia/Shanghai'], AVR: ['Amravati', 'Asia/Calcutta'], BOR: ['Bokeo', 'Asia/Vientiane'],
    BXT: ['Bontang-Borneo Island', 'Asia/Makassar'], BPE: ['Qinhuangdao', 'Asia/Shanghai'], GES: ['General Santos', 'Asia/Manila'], GVA: ['Geneva', 'Europe/Zurich'] };
  for (const [iata, [city, tz]] of Object.entries(fixed)) assert.deepEqual([AP[iata][2], AP[iata][7]], [city, tz], iata);
});
