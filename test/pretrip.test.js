// „Před cestou“: co zařídit (pojištění, EHIC, DROZD, řidičský průkaz, zásuvky) a chytrý seznam věcí na cestu –
// kontrola dat (public/data/pretrip.json) a pravidel z public/js/pretrip.js. Klasické skripty prohlížeče přes node:vm
// s pravými vstupními podmínkami (data/entry.json) a daty zemí; podnebí dodávají testy rovnou (bez sítě).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const PT = JSON.parse(read('public/data/pretrip.json'));
const ENTRY = JSON.parse(read('data/entry.json'));
const COUNTRIES = JSON.parse(read('data/countries.json'));
const CLIMATE = JSON.parse(read('data/climate.json'));
const ISO = new Set(COUNTRIES.map((c) => c.iso2));
const EU = 'AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE'.split(' ');

/** Kontext jako v prohlížeči: helpery z app.js, země, vstupní podmínky, pretrip.js; volitelně trip.js a úložiště. */
function load({ withTrip = false, storage = null, data = PT } = {}) {
  const ctx = { window: {}, URLSearchParams, TextEncoder, TextDecoder, btoa, atob, console, URL, Intl, setTimeout, clearTimeout, CompressionStream, DecompressionStream, location: { origin: 'https://atlas.example', pathname: '/', hash: '' } };
  if (storage) ctx.localStorage = storage;
  vm.createContext(ctx);
  vm.runInContext(read('public/js/ics.js'), ctx, { filename: 'ics.js' });
  vm.runInContext(read('public/js/sharelink.js'), ctx, { filename: 'sharelink.js' });
  vm.runInContext('var ShareLink = window.ShareLink;', ctx);
  const helpers = read('public/js/app.js').match(/^const (esc|safeUrl|pad|fmtYMD|fmtDate|czk) = .*$/gm);
  assert.equal(helpers.length, 6);
  vm.runInContext(`const Ics = window.Ics;\n${helpers.join('\n')}\nvar byIso = {}; var S = {}; var flag = (iso) => '[' + iso + ']'; var PACK = ['Pas / OP'];`, ctx, { filename: 'app-helpers.js' });
  for (const c of COUNTRIES) vm.runInContext(`byIso[${JSON.stringify(c.iso2)}] = ${JSON.stringify(c)};`, ctx);
  vm.runInContext(read('public/js/entry.js'), ctx, { filename: 'entry.js' });
  vm.runInContext('var Entry = window.Entry;', ctx);
  ctx.window.Entry.set(JSON.parse(JSON.stringify(ENTRY)));
  vm.runInContext(read('public/js/pretrip.js'), ctx, { filename: 'pretrip.js' });
  vm.runInContext('var PreTrip = window.PreTrip;', ctx);
  if (withTrip) vm.runInContext(read('public/js/trip.js'), ctx, { filename: 'trip.js' });
  ctx.window.PreTrip.set(JSON.parse(JSON.stringify(data)));
  return ctx;
}
const ctx = load();
const P = ctx.window.PreTrip;
const plain = (x) => JSON.parse(JSON.stringify(x));
const sp = (s) => String(s).replace(/ /g, ' ');
const strip = (h) => sp(String(h).replace(/<[^>]+>/g, ''));
/** Podnebí u letiště z data/climate.json (jako api/climate) – { name, hi, lo, p } po 12 měsících. */
const at = (iata, name = iata) => { const v = CLIMATE.cells[CLIMATE.airports[iata]]; return { name, hi: v.slice(0, 12), lo: v.slice(12, 24), p: v.slice(24, 36) }; };
/** Umělé podnebí: stejné hodnoty celý rok. */
const flat = (hi, lo, p, name = 'Místo') => ({ name, hi: Array(12).fill(hi), lo: Array(12).fill(lo), p: Array(12).fill(p) });
const leg = (from, to, date) => ({ from, to, date, dep: `${date}T10:00:00`, arr: `${date}T14:00:00`, hasTime: true });
/** Cesta z průvodce (zkráceně): cíl, termín, auto, zavazadla, program. */
function trip({ cc = 'ES', label = 'Barcelona', out = '2027-07-10', back = '2027-07-17', car = null, bags = 'none', plan = null, ...over } = {}) {
  return { v: 1, created: 1767225600000, adults: 2, bags, nightsOneWay: 3, booked: {}, step: 'summary', ground: {}, flight: { out: leg('PRG', 'XXX', out), back: back ? leg('XXX', 'PRG', back) : null, flightCzk: 5000 }, dest: { label, cc, lat: 41.3, lon: 2.1 }, stay: null, car, plan, ...over };
}
const CAR = { mode: 'manual', totalCzk: 9000 };
const ctxOf = (t, o = {}) => P.contextOf(t, { isos: [t.dest.cc], climate: [], ...o });
const todo = (t, o) => P.todos(ctxOf(t, o));
const byId = (list, id) => list.find((x) => x.id === id);
const items = (t, o) => P.pack(ctxOf(t, o)).flatMap((g) => g.items);
const itemIds = (t, o) => items(t, o).map((x) => x.id);

/* ---------- data ---------- */
test('pretrip.json: metadata, zdroje jen https a oficiální weby, telefon MZV', () => {
  assert.equal(PT.checked, '2026-10');
  assert.match(PT.note, /ověř/);
  for (const [k, u] of Object.entries(PT.sources)) assert.match(u, /^https:\/\/[^\s"<>]+$/, k);
  assert.equal(PT.sources.drozd, 'https://drozd.mzv.gov.cz/');
  assert.match(PT.sources.desatero, /^https:\/\/mzv\.gov\.cz\//);
  assert.match(PT.sources.kzpTourist, /^https:\/\/kancelarzp\.cz\//);
  assert.match(PT.sources.idp, /^https:\/\/portal\.gov\.cz\//);
  assert.match(PT.sources.untc1949, /^https:\/\/treaties\.un\.org\/.*XI-B-1&/);
  assert.match(PT.sources.untc1968, /^https:\/\/treaties\.un\.org\/.*XI-B-19&/);
  assert.equal(PT.phones.emergency, '+420 222 420 222');
  // žádné HTML ani řídicí znaky v textech dat
  const walk = (v, path) => {
    if (typeof v === 'string') assert.ok(!/[<>\u0000-\u001f]|&[a-z#0-9]+;/i.test(v), `${path}: HTML nebo řídicí znak`);
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  };
  walk(PT, 'pretrip');
});

test('pretrip.json: EHIC = EU + EHP + Švýcarsko + Velká Británie, smluvní státy s nárokem jen na neodkladnou péči', () => {
  assert.deepEqual([...PT.health.ehic].sort(), [...EU, 'IS', 'LI', 'NO', 'CH', 'GB'].sort());
  assert.deepEqual([...PT.eea].sort(), [...EU, 'IS', 'LI', 'NO'].sort());
  assert.deepEqual(Object.keys(PT.health.contract).sort(), ['AL', 'BA', 'ME', 'MK', 'RS', 'TN', 'TR']);
  for (const [iso, t] of Object.entries(PT.health.contract)) {
    assert.ok(ISO.has(iso), iso);
    assert.match(t, /neodkladn/, `${iso}: rozsah péče`);
  }
  // formuláře podle Kanceláře zdravotního pojištění
  for (const [iso, form] of [['TR', 'CZ/TR 111'], ['AL', 'CZ/AL 111'], ['TN', 'CZ/TN 111']]) assert.ok(PT.health.contract[iso].includes(form), iso);
  for (const iso of ['RS', 'ME', 'MK']) assert.match(PT.health.contract[iso], /EHIC/, iso);
});

test('pretrip.json: řidičské průkazy – úrovně, vzory MŘP, zdroj MZV (Doklady/Specifika) nebo gov.uk', () => {
  const N = ['ok', 'rec', 'req', 'transl', 'local'];
  for (const [iso, d] of Object.entries(PT.driving)) {
    assert.ok(ISO.has(iso), iso);
    assert.ok(N.includes(d.n), `${iso}: ${d.n}`);
    assert.ok(d.f === undefined || ['1949', '1968', 'any'].includes(d.f), `${iso}: vzor ${d.f}`);
    assert.ok(typeof d.t === 'string' && d.t.length >= 15 && d.t.length <= 200, `${iso}: poznámka`);
    assert.match(d.s, /^https:\/\/(mzv\.gov\.cz\/jnp\/cz\/encyklopedie_statu\/[\w/]+\/cestovani\/(documents|other)\.html|www\.gov\.uk\/driving-nongb-licence)$/, `${iso}: zdroj`);
    assert.ok(!PT.eea.includes(iso), `${iso}: EU/EHP řeší obecné pravidlo`);
  }
  // běžné destinace z ověřených stránek MZV
  const want = { US: ['req', '1949'], JP: ['req', '1949'], AU: ['transl', '1949'], TH: ['rec', 'any'], VN: ['req', '1968'], EG: ['req', 'any'], MA: ['ok', undefined], AE: ['req', 'any'], CA: ['rec', '1949'], MX: ['req', undefined], BR: ['req', '1968'], CH: ['ok', undefined], GB: ['ok', undefined], CN: ['local', undefined] };
  for (const [iso, [n, f]] of Object.entries(want)) assert.deepEqual([PT.driving[iso].n, PT.driving[iso].f], [n, f], iso);
  // Turecko a Indonésie MZV neuvádí → „ověř“ (a jen nápověda z úmluv OSN)
  assert.equal(PT.driving.TR, undefined);
  assert.equal(PT.driving.ID, undefined);
  for (const [iso, v] of Object.entries(PT.conv)) { assert.ok(ISO.has(iso), iso); assert.ok(['1949', '1968', 'both'].includes(v), iso); }
  assert.equal(PT.conv.TR, 'both');
  assert.equal(PT.conv.JP, '1949');
  assert.equal(PT.conv.ID, undefined, 'Indonésie Vídeňskou úmluvu jen podepsala');
});

test('pretrip.json: zásuvky a napětí pro skoro všechny země, typy A–O, běžné destinace', () => {
  const keys = Object.keys(PT.plugs);
  assert.ok(keys.length >= 190, `zemí se zásuvkami: ${keys.length}`);
  for (const [iso, p] of Object.entries(PT.plugs)) {
    assert.ok(ISO.has(iso), iso);
    assert.match(p.t, /^[A-O](,[A-O])*$/, `${iso}: typy`);
    assert.ok(p.v === undefined || /^\d{3}(\/\d{3})?$/.test(p.v), `${iso}: napětí ${p.v}`);
    assert.match(p.hz, /^(50|60)(\/60)?$/, `${iso}: frekvence`);
  }
  const want = { JP: ['A,B', '100', '50/60'], US: ['A,B', '120', '60'], DE: ['C,F', '230', '50'], AU: ['I', '230', '50'], CH: ['C,J', '230', '50'], IT: ['C,F,L', '230', '50'], AE: ['G', '230', '50'], TH: ['A,B,C,O', '230', '50'], BR: ['C,N', '127/220', '60'] };
  for (const [iso, [t, v, hz]] of Object.entries(want)) assert.deepEqual([PT.plugs[iso].t, PT.plugs[iso].v, PT.plugs[iso].hz], [t, v, hz], iso);
  assert.equal(PT.plugs.GB.m, 'G', 'Velká Británie: adaptér na G (D a M jsou historické)');
});

/* ---------- pravidla: co zařídit ---------- */
test('řidičský průkaz: Japonsko + auto → nutný MŘP vzor 1949; Itálie + auto → stačí český ŘP; bez auta nic', () => {
  const jp = byId(todo(trip({ cc: 'JP', label: 'Tokio', car: CAR })), 'drive');
  assert.equal(jp.level, 'must');
  assert.equal(jp.title, 'Vyřiď mezinárodní řidičský průkaz (vzor 1949)');
  assert.deepEqual(plain(jp.forms), ['1949']);
  assert.ok(jp.need);
  const line = strip(jp.lines[0]);
  assert.match(line, /^\[JP\] Japonsko nutný MŘP \(vzor 1949\) Český ŘP v Japonsku neplatí/);
  assert.match(jp.lines[0], /href="https:\/\/mzv\.gov\.cz\/jnp\/cz\/encyklopedie_statu\/asie\/japonsko\/cestovani\/documents\.html"/);
  assert.match(strip(jp.lines.at(-1)), /obecní úřad obce s rozšířenou působností na počkání za 200 Kč .* Vzor 1949 platí 1 rok, vzor 1968 3 roky/);
  assert.ok(itemIds(trip({ cc: 'JP', car: CAR })).includes('doc-idp'));
  assert.equal(items(trip({ cc: 'JP', car: CAR })).find((x) => x.id === 'doc-idp').text, 'Mezinárodní řidičský průkaz (vzor 1949)');

  const it = byId(todo(trip({ cc: 'IT', label: 'Řím', car: CAR })), 'drive');
  assert.equal(it.level, 'info');
  assert.equal(it.title, 'Řidičský průkaz: stačí český');
  assert.match(strip(it.lines[0]), /stačí český ŘP V EU a EHP platí český řidičský průkaz/);
  assert.ok(!itemIds(trip({ cc: 'IT', car: CAR })).includes('doc-idp'));
  assert.ok(itemIds(trip({ cc: 'IT', car: CAR })).includes('doc-dl'));
  // bez auta (nebo „Auto nepotřebuji“) se řidičák neřeší
  assert.equal(byId(todo(trip({ cc: 'JP' })), 'drive'), undefined);
  assert.equal(byId(todo(trip({ cc: 'JP', car: { mode: 'skip', totalCzk: 0 } })), 'drive'), undefined);
  // trasa autem přes víc míst = auto, dokud ho cestovatel neodmítne
  const route = { mode: 'multi', transport: 'car', bases: [{ name: 'A', lat: 35, lon: 139, nights: 2 }, { name: 'B', lat: 34.7, lon: 135.5, nights: 2 }] };
  assert.equal(ctxOf(trip({ cc: 'JP', route })).car, true);
  assert.equal(ctxOf(trip({ cc: 'JP', route: { ...route, transport: 'transit' } })).car, false);
});

test('řidičský průkaz: víc zemí – oba vzory (USA 1949 + Vietnam 1968), „ověř“ s nápovědou z úmluv, místní povolení', () => {
  const t = trip({ cc: 'US', car: CAR });
  const both = byId(todo(t, { isos: ['US', 'VN'] }), 'drive');
  assert.deepEqual(plain(both.forms), ['1949', '1968']);
  assert.equal(both.title, 'Vyřiď mezinárodní řidičský průkaz (oba vzory: 1949 i 1968)');
  assert.match(strip(both.lines.at(-1)), /na oba vzory dostaneš dva průkazy \(2 fotky\)/);
  // Turecko: MZV neuvádí → ověř; je stranou obou úmluv
  const tr = byId(todo(trip({ cc: 'TR', car: CAR })), 'drive');
  assert.equal(tr.level, 'rec');
  assert.equal(tr.title, 'Ověř, jestli ti stačí český řidičský průkaz');
  assert.match(strip(tr.lines[0]), /Turecko neověřeno Podmínky si ověř na webu MZV \(záložka Doklady\)\. Země je smluvní stranou Ženevské \(1949\) i Vídeňské \(1968\) úmluvy/);
  assert.match(tr.lines[0], /href="https:\/\/mzv\.gov\.cz\/jnp\/cz\/encyklopedie_statu\/evropa\/turecko\/cestovani\/documents\.html"/);
  // Indonésie: není stranou úmluv
  assert.match(strip(byId(todo(trip({ cc: 'ID', car: CAR })), 'drive').lines[0]), /není smluvní stranou úmluv o silničním provozu/);
  // Čína: místní řidičský průkaz – nutné, ale ne MŘP
  const cn = byId(todo(trip({ cc: 'CN', car: CAR })), 'drive');
  assert.equal(cn.level, 'must');
  assert.equal(cn.title, 'Řízení v zemi Čína: český ani mezinárodní průkaz nestačí');
  assert.equal(cn.need, false);
  // Srí Lanka: místní povolení na základě MŘP 1949; Austrálie: překlad nebo MŘP 1949
  assert.deepEqual(plain(byId(todo(trip({ cc: 'LK', car: CAR })), 'drive').forms), ['1949']);
  assert.equal(byId(todo(trip({ cc: 'AU', car: CAR })), 'drive').title, 'Vyřiď mezinárodní řidičský průkaz (vzor 1949)');
  // Thajsko a Kanada: doporučeno; SAE: kterýkoli vzor → 1968
  assert.equal(byId(todo(trip({ cc: 'CA', car: CAR })), 'drive').title, 'Zvaž mezinárodní řidičský průkaz (vzor 1949)');
  const ae = byId(todo(trip({ cc: 'AE', car: CAR })), 'drive');
  assert.deepEqual(plain(ae.forms), ['1968']);
  assert.match(strip(ae.lines[0]), /nutný MŘP \(kterýkoli vzor\)/);
  // Japonsko + SAE: SAE uzná i vzor 1949 → jeden průkaz
  assert.deepEqual(plain(byId(todo(t, { isos: ['JP', 'AE'] }), 'drive').forms), ['1949']);
});

test('pojištění: vždy; mimo EU důraz, v EU kvůli spoluúčasti a převozu; Bělorusko – pojištění jako podmínka vstupu', () => {
  const by = byId(todo(trip({ cc: 'BY', label: 'Minsk' })), 'ins');
  assert.equal(by.level, 'must');
  const txt = by.lines.map(strip);
  assert.match(txt[0], /Bez pojištění léčebných výloh MZV nedoporučuje vůbec vycestovat/);
  assert.match(txt[1], /^Bělorusko: mimo EU, EHP, Švýcarsko a Velkou Británii ošetření platíš sám – česká zdravotní pojišťovna proplatí jen neodkladnou péči, a to nejvýš do výše českých cen/);
  assert.ok(txt.includes('Podmínka vstupu – Bělorusko: nutný pas, pojištění min. 10 000 EUR.'), txt.join('\n'));
  assert.deepEqual(plain(by.links.map((l) => l[0])), [PT.sources.desatero, PT.sources.kzpInsurance]);
  const es = byId(todo(trip()), 'ins').lines.map(strip);
  assert.ok(es.includes('I tam, kde platí EHIC, se vyplatí: EHIC nekryje spoluúčast, převoz do ČR ani asistenční službu.'));
  assert.ok(!es.some((l) => /mimo EU/.test(l)));
  // věta o pojištění z poznámky ke vstupu – data ani „min.“ větu nekončí
  const note = (iso) => P.insuranceNote(ENTRY.countries.find((r) => r.iso2 === iso));
  assert.equal(note('BY'), 'nutný pas, pojištění min. 10 000 EUR');
  assert.equal(note('GE'), 'Od 1. 1. 2026 povinné cestovní pojištění (min. 30 000 GEL) – kontrola při vstupu');
  assert.equal(note('TZ'), 'Od 1. 10. 2026 povinné státní pojištění 44 USD/92 dní (pevnina NIC, Zanzibar ZIC – dle místa vstupu)');
  assert.equal(note('CL'), 'Nutné: 46 USD/den, zpáteční letenka, pojištění');
  assert.equal(note('DE'), '');
  // turistika na horách → ověřit krytí sportů
  const hike = byId(todo(trip({ cc: 'CH', pretrip: { acts: ['hike'] } })), 'ins').lines.map(strip);
  assert.ok(hike.some((l) => /Ověř, že pojistka kryje i turistiku na horách/.test(l)), hike.join('\n'));
});

test('EHIC: EU/EHP/Švýcarsko/Británie ano, smluvní státy s formulářem, jinde ne', () => {
  const es = byId(todo(trip()), 'ehic');
  assert.equal(es.title, 'Vezmi Evropský průkaz zdravotního pojištění (EHIC)');
  assert.match(strip(es.lines[0]), /^Platí v zemích: Španělsko – nárok na lékařsky nezbytnou péči za stejných podmínek jako místní/);
  assert.match(strip(es.lines[1]), /U VZP je EHIC přímo modrý průkaz pojištěnce/);
  assert.ok(itemIds(trip()).includes('doc-ehic'));
  assert.ok(byId(todo(trip({ cc: 'GB', label: 'Londýn' })), 'ehic'), 'Velká Británie: EHIC platí');
  assert.ok(byId(todo(trip({ cc: 'CH' })), 'ehic'));
  assert.equal(byId(todo(trip({ cc: 'JP' })), 'ehic'), undefined);
  assert.equal(byId(todo(trip({ cc: 'US' })), 'ehic'), undefined);
  const tr = byId(todo(trip({ cc: 'TR', label: 'Antalya' })), 'ehic');
  assert.equal(tr.title, 'Vyžádej si u pojišťovny formulář pro Turecko');
  assert.match(strip(tr.lines[0]), /CZ\/TR 111/);
  assert.ok(items(trip({ cc: 'TR' })).some((x) => x.text === 'Formulář CZ/TR 111 od zdravotní pojišťovny (Turecko)'));
  assert.ok(!itemIds(trip({ cc: 'TR' })).includes('doc-ehic'));
  const rs = byId(todo(trip({ cc: 'RS' })), 'ehic');
  assert.equal(rs.title, 'Vezmi Evropský průkaz zdravotního pojištění (EHIC)');
  assert.match(strip(rs.lines[0]), /INO-1/);
  assert.ok(itemIds(trip({ cc: 'RS' })).includes('doc-ehic'));
});

test('DROZD: mimo EU a do rizikových zemí (bezpečnost z dat zemí), v bezpečné EU ne', () => {
  assert.equal(byId(todo(trip()), 'drozd'), undefined, 'Španělsko');
  assert.equal(byId(todo(trip({ cc: 'FR' })), 'drozd'), undefined, 'Francie');
  assert.equal(byId(todo(trip({ cc: 'CH' })), 'drozd'), undefined, 'Švýcarsko – Schengen');
  const jp = byId(todo(trip({ cc: 'JP' })), 'drozd');
  assert.equal(jp.level, 'rec');
  assert.equal(jp.links[0][0], 'https://drozd.mzv.gov.cz/');
  assert.match(strip(jp.lines.join(' ')), /Údaje se smažou 30 dní po návratu.*Nouzová linka MZV \(nonstop\): \+420 222 420 222/);
  assert.equal(byId(todo(trip({ cc: 'GB' })), 'drozd').level, 'rec', 'Británie mimo EU');
  // velmi riziková země (bezpečnost 1–2) → důležité, s varováním a odkazem na upozornění MZV
  const by = byId(todo(trip({ cc: 'BY' })), 'drozd');
  assert.equal(by.level, 'must');
  assert.match(strip(by.lines[0]), /MZV k zemi Bělorusko vydává varování/);
  assert.ok(by.links.some((l) => l[0] === PT.sources.warnings));
  // země EU se zvýšeným rizikem by DROZD dostala také (bezpečnost ≤ 3)
  const evil = load();
  vm.runInContext('byIso.ES = { ...byIso.ES, safety: 3 };', evil);
  assert.ok(byId(evil.window.PreTrip.todos(evil.window.PreTrip.contextOf(trip(), { isos: ['ES'], climate: [] })), 'drozd'));
});

test('zásuvky a měna: adaptér podle typu, nižší napětí, europlug; měna česky', () => {
  const gb = byId(todo(trip({ cc: 'GB' })), 'plug');
  assert.equal(gb.title, 'Kup cestovní adaptér do zásuvky');
  assert.match(strip(gb.lines[0]), /Spojené království: zásuvky typ G, D, M · 230 V \/ 50 Hz – potřebuješ adaptér/);
  assert.ok(items(trip({ cc: 'GB' })).some((x) => x.text === 'Adaptér do zásuvky typu G'));
  const us = strip(byId(todo(trip({ cc: 'US' })), 'plug').lines[0]);
  assert.match(us, /zásuvky typ A, B · 120 V \/ 60 Hz – potřebuješ adaptér · nižší napětí: spotřebiče se štítkem 100–240 V/);
  const de = byId(todo(trip({ cc: 'DE' })), 'plug');
  assert.equal(de.level, 'info');
  assert.equal(de.title, 'Zásuvky: české zástrčky pasují');
  assert.ok(!itemIds(trip({ cc: 'DE' })).some((x) => x.startsWith('tc-adapter')));
  assert.match(strip(byId(todo(trip({ cc: 'CH' })), 'plug').lines[0]), /pasují jen ploché dvoukolíkové zástrčky \(europlug\), na ostatní adaptér/);
  assert.ok(items(trip({ cc: 'CH' })).some((x) => x.text === 'Adaptér do zásuvky typu J'));
  // USA a Japonsko = jeden adaptér A/B
  const ab = items(trip({ cc: 'US' }), { isos: ['US', 'JP'] }).filter((x) => x.id.startsWith('tc-adapter'));
  assert.deepEqual(plain(ab), [{ id: 'tc-adapter-AB', text: 'Adaptér do zásuvky typu A/B', note: 'Spojené státy americké, Japonsko' }]);
  assert.equal(byId(todo(trip({ cc: 'JP' })), 'money').title, 'Měna: japonský jen (JPY)');
  assert.equal(byId(todo(trip({ cc: 'JP' })), 'money').level, 'info');
});

/* ---------- pravidla: co sbalit ---------- */
test('seznam věcí: zima → teplé oblečení; pláž + horko → plavky a opalovací krém; déšť → deštník', () => {
  // Tromsø v lednu (podnebí z dat): mráz, sníh
  const cold = trip({ cc: 'NO', label: 'Tromsø', out: '2027-01-10', back: '2027-01-14', bags: 'checked' });
  const c1 = itemIds(cold, { climate: [at('TOS', 'Tromsø')] });
  for (const id of ['cl-warm', 'cl-hat', 'cl-thermo', 'cl-boots', 'cl-sweater']) assert.ok(c1.includes(id), id);
  assert.ok(!c1.includes('cl-umbrella') && !c1.includes('ac-swim') && !c1.includes('hl-sun'), c1.join());
  assert.equal(items(cold, { climate: [at('TOS', 'Tromsø')] }).find((x) => x.id === 'cl-warm').note, 'ráno kolem −5\u00a0°C');
  // Barcelona v červenci: horko a pláže (štítek země) → plavky, opalovací krém, lehké oblečení
  const beach = trip({ cc: 'ES', bags: 'cabin' });
  const cx = ctxOf(beach, { climate: [at('BCN', 'Barcelona')] });
  assert.ok(cx.acts.has('beach'), 'pláž podle země a podnebí');
  const c2 = P.pack(cx).flatMap((g) => g.items).map((x) => x.id);
  for (const id of ['ac-swim', 'ac-towel', 'hl-sun', 'cl-light', 'cl-cap', 'cl-sunglass']) assert.ok(c2.includes(id), id);
  assert.ok(!c2.includes('cl-warm') && !c2.includes('cl-hat'));
  // horko bez pláže (aktivity zvolené ručně) → bez plavek, opalovací krém zůstává
  const c3 = itemIds(trip({ cc: 'ES', pretrip: { acts: ['city'] } }), { climate: [flat(31, 22, 10)] });
  assert.ok(!c3.includes('ac-swim') && c3.includes('hl-sun') && c3.includes('ac-daybag'));
  // u moře i v teplé zimě (Marsa Alam v prosinci ~23 °C přes den) – dřív až od 24 °C, plavky chyběly; chladněji ne
  assert.ok(ctxOf(trip({ cc: 'ES' }), { climate: [flat(23, 16, 20)] }).acts.has('beach'));
  assert.ok(!ctxOf(trip({ cc: 'ES' }), { climate: [flat(20, 12, 20)] }).acts.has('beach'));
  // pláž z programu (kategorie beach) i bez štítku země
  const plan = { days: [{ date: '2027-07-11', items: [{ name: 'Pláž', category: 'beach' }] }] };
  assert.ok(ctxOf(trip({ cc: 'AT', plan }), { climate: [flat(28, 18, 60)] }).acts.has('beach'));
  // déšť: období dešťů → nepromokavá bunda, jinak deštník
  assert.ok(itemIds(trip({ cc: 'TH' }), { climate: [flat(32, 24, 260)] }).includes('cl-rainjacket'));
  assert.ok(itemIds(trip({ cc: 'JP' }), { climate: [flat(18, 9, 120)] }).includes('cl-umbrella'));
  // podnebí neznámé → obecná položka
  assert.ok(itemIds(trip({ cc: 'JP' })).includes('cl-weather'));
});

test('podnebí: měsíce cesty i přes přelom roku, souhrn víc míst trasy', () => {
  assert.deepEqual(plain(P.monthsOf('2026-12-28', '2027-01-03')), [11, 0]);
  assert.deepEqual(plain(P.monthsOf('2027-03-12', '2027-03-21')), [2]);
  assert.deepEqual(plain(P.monthsOf('bad', '2027-01-01')), []);
  const s = plain(P.summarize([at('NRT', 'Tokio'), at('OKA', 'Okinawa')], [2]));
  assert.deepEqual(s.places.map((p) => p.name), ['Tokio', 'Okinawa']);
  assert.equal(s.hi, Math.max(...s.places.map((p) => p.hi)));
  assert.equal(s.lo, Math.min(...s.places.map((p) => p.lo)));
  assert.ok(s.places[1].hi > s.places[0].hi, 'Okinawa je v březnu teplejší');
  assert.equal(P.summarize([{ name: 'x', hi: [1], lo: [], p: [] }], [0]), null, 'neúplná data');
  // trasa přes víc míst: podnebí každého místa (Praha v lednu, Lisabon v lednu)
  const route = { mode: 'multi', transport: 'transit', bases: [{ name: 'A', lat: 50, lon: 14, nights: 2 }, { name: 'B', lat: 38.7, lon: -9.1, nights: 2 }] };
  const cx = P.contextOf(trip({ cc: 'PT', out: '2027-01-10', back: '2027-01-14', route }), { isos: ['PT'], climate: [flat(2, -3, 40, 'A'), flat(15, 8, 100, 'B')] });
  assert.deepEqual([cx.climate.minHi, cx.climate.hi, cx.climate.lo], [2, 15, -3]);
});

test('seznam věcí: doklady (OP vs. pas, registrace), očkování a antimalarika, zavazadla a délka cesty', () => {
  const es = items(trip());
  assert.equal(es.find((x) => x.id === 'doc-op').text, 'Občanský průkaz (nebo pas)');
  assert.ok(!es.some((x) => x.id === 'doc-pass'));
  const jp = items(trip({ cc: 'JP', out: '2027-03-12', back: '2027-03-21' }));
  assert.deepEqual(plain(jp.find((x) => x.id === 'doc-pass')), { id: 'doc-pass', text: 'Cestovní pas', note: 'občanský průkaz nestačí' });
  const ke = items(trip({ cc: 'KE', out: '2027-02-01', back: '2027-02-14' }), { climate: [flat(33, 23, 30)] });
  assert.deepEqual(plain(ke.find((x) => x.id === 'doc-pass')), { id: 'doc-pass', text: 'Cestovní pas', note: 'platný aspoň do 14. 8. 2027' });
  assert.equal(ke.find((x) => x.id === 'doc-reg-KE').text, 'Potvrzení: eTA (Keňa)');
  for (const id of ['hl-rep', 'hl-mal', 'doc-vacc']) assert.ok(ke.some((x) => x.id === id), id);
  // v zimě bez komárů; žlutá zimnice jen „při příletu z rizikové země“ (SAE) se cesty z ČR netýká
  assert.ok(!itemIds(trip({ cc: 'JP' }), { climate: [flat(12, 4, 100)] }).includes('hl-rep'));
  const ae = itemIds(trip({ cc: 'AE' }), { climate: [flat(30, 20, 10)] });
  assert.ok(!ae.includes('hl-rep') && !ae.includes('doc-vacc'), ae.join());
  assert.equal(items(trip({ cc: 'GH' })).find((x) => x.id === 'doc-vacc').note, 'očkování proti žluté zimnici je podmínkou vstupu');
  assert.equal(items(trip({ cc: 'KE' })).find((x) => x.id === 'doc-vacc').note, 'když se necháš očkovat proti žluté zimnici');
  // přestup s ESTA (USA) → potvrzení registrace i pro cíl bez víza
  assert.ok(itemIds(trip({ cc: 'MX' }), { via: ['US'] }).includes('doc-reg-US'));
  // zavazadla: jen pod sedadlo / kabinový kufr / kufr k odbavení / vlak
  const tips = (t) => P.bagTips(ctxOf(t));
  // (bez podnebí jen praní – kdy balit na vrstvy, ukazuje test níže)
  assert.match(tips(trip({ out: '2027-07-01', back: '2027-07-11' }))[0], /^Letíš jen s malým zavazadlem pod sedadlo – rozměry ověř u aerolinky; na 10 nocí počítej s praním\.$/);
  assert.match(tips(trip())[1], /balení do 100 ml v průhledném uzavíratelném sáčku do 1 l/);
  assert.equal(tips(trip({ bags: 'checked' })).length, 1);
  assert.match(tips(trip({ bags: 'checked' }))[0], /powerbanku a náhradní baterie dej do příručního zavazadla/);
  const ground = trip({ overland: { on: true, out: { date: '2027-07-10' }, back: { date: '2027-07-12' }, to: { label: 'Vídeň', lat: 48.2, lon: 16.4 } }, cc: 'AT' });
  assert.deepEqual(plain(tips(ground)), []);
  assert.ok(items(ground).some((x) => x.text === 'Jízdenky na vlak / autobus'));
  assert.equal(items(ground).find((x) => x.id === 'tc-power').note, undefined, 'powerbanka bez letecké poznámky');
  // délka cesty: prádlo na nejvýš 7 dní, déle praní
  assert.deepEqual(plain(items(trip({ out: '2027-07-01', back: '2027-07-03' })).find((x) => x.id === 'cl-under')), { id: 'cl-under', text: 'Spodní prádlo a ponožky (3×)' });
  assert.equal(items(trip({ out: '2027-07-01', back: '2027-07-15' })).find((x) => x.id === 'cl-under').note, 'na delší cestu počítej s praním');
});

test('cesta s dětmi: vlastní doklad pro dítě, EHIC pro každého, k autu dětská autosedačka, miminko; bez dětí nic navíc', () => {
  const ids = (t, o) => plain(itemIds(t, o)).filter((id) => id === 'doc-kid' || /^kd-/.test(id));
  // Portugalsko (stačí OP), 2 dospělí + dítě, auto na místě
  const pt = items(trip({ cc: 'PT', label: 'Lisabon', car: CAR, children: 1 }));
  assert.deepEqual(plain(pt.find((x) => x.id === 'doc-kid')), { id: 'doc-kid', text: 'Vlastní doklad pro dítě', note: 'občanský průkaz nebo pas – zápis v pasu rodiče neplatí' });
  assert.equal(pt.find((x) => x.id === 'doc-ehic').note, 'každý má svůj, i děti');
  assert.match(pt.find((x) => x.id === 'kd-seat').note, /^v EU povinná pro děti do 135–150 cm podle země/);
  assert.deepEqual(ids(trip({ cc: 'PT', car: CAR, children: 1 })), ['doc-kid', 'kd-seat', 'kd-fun']);
  // pas tam, kde OP nestačí; dvě děti a miminko bez auta: bez autosedačky, s věcmi pro miminko (výživa na palubu)
  const jp = items(trip({ cc: 'JP', children: 2, infants: 1 }));
  assert.deepEqual([jp.find((x) => x.id === 'doc-kid').text, jp.find((x) => x.id === 'doc-kid').note], ['Vlastní doklad pro každé dítě', 'cestovní pas – zápis v pasu rodiče neplatí']);
  assert.deepEqual(ids(trip({ cc: 'JP', children: 2, infants: 1 })), ['doc-kid', 'kd-fun', 'kd-baby']);
  assert.match(jp.find((x) => x.id === 'kd-baby').note, /na palubu i nad 100 ml/);
  // bez dětí beze změny
  assert.deepEqual(ids(trip({ cc: 'PT', car: CAR })), []);
  assert.equal(items(trip({ cc: 'PT' })).find((x) => x.id === 'doc-ehic').note, undefined);
  // shrnutí karty
  assert.match(strip(P.html(trip({ cc: 'PT', children: 1 }), { isos: ['PT'], climate: [] })), /let jen s malým zavazadlem · s dítětem/);
});

test('balit na vrstvy: ve stálém horku ne (Bangkok, Phuket), v chladu, při velkém rozdílu dne a noci, na horách a na sněhu ano', () => {
  const layered = /; na 10 nocí bal na vrstvy a počítej s praním\.$/;
  const tip = (t, climate) => P.bagTips(ctxOf(t, { climate }))[0];
  const tenNights = (month, over = {}) => trip({ out: `2027-${month}-05`, back: `2027-${month}-15`, ...over });
  // Bangkok v lednu (data/climate.json: přes den ~31 °C, v noci ~22 °C) – jen praní
  const bkk = tenNights('01', { cc: 'TH', label: 'Bangkok' });
  assert.equal(tip(bkk, [at('BKK', 'Bangkok')]), 'Letíš jen s malým zavazadlem pod sedadlo – rozměry ověř u aerolinky; na 10 nocí počítej s praním.');
  const card = strip(P.html(bkk, { isos: ['TH'], climate: [at('BKK', 'Bangkok')] }));
  assert.match(card, /Bangkok: přes den/);
  assert.doesNotMatch(card, /vrstv/);
  // Bangkok a Phuket v kterémkoli měsíci (s výchozími aktivitami: pláž a město) – nikdy
  for (let m = 1; m <= 12; m++) {
    for (const ap of ['BKK', 'HKT']) {
      const t = tenNights(String(m).padStart(2, '0'), { cc: 'TH' });
      assert.equal(P.layers(ctxOf(t, { climate: [at(ap)] })), false, `${ap} ${m}`);
    }
  }
  // horké léto u moře (Barcelona v červenci ~30 / 19 °C) ne; chladno (Tokio v lednu, Barcelona v listopadu) ano
  assert.doesNotMatch(tip(tenNights('07', { cc: 'ES' }), [at('BCN')]), /vrstvy/);
  assert.match(tip(tenNights('01', { cc: 'JP' }), [at('NRT')]), layered);
  assert.match(tip(tenNights('11', { cc: 'ES' }), [at('BCN')]), layered);
  // velký rozdíl dne a noci: Madrid v červnu (~30 / 15 °C), Dubaj v lednu (~24 / 15 °C); teplé noci (Dubaj v červenci,
  // Lisabon v červnu ~26 / 17 °C) ne
  assert.match(tip(tenNights('06', { cc: 'ES' }), [at('MAD')]), layered);
  assert.doesNotMatch(tip(tenNights('06', { cc: 'PT', pretrip: { acts: ['city'] } }), [at('LIS')]), /vrstvy/);
  assert.match(tip(tenNights('01', { cc: 'AE' }), [at('DXB')]), layered);
  assert.doesNotMatch(tip(tenNights('07', { cc: 'AE' }), [at('DXB')]), /vrstvy/);
  // hory a sníh: zvolená turistika i v teple, sníh i bez známého podnebí
  assert.match(tip(tenNights('01', { cc: 'TH', pretrip: { acts: ['hike'] } }), [at('BKK')]), layered);
  assert.match(tip(tenNights('01', { cc: 'AT', pretrip: { acts: ['snow'] } }), []), layered);
  // výchozí turistika: v zemi s horami ano (Peru – Andy, i když Lima je v únoru ~23 / 17 °C), kvůli vodopádům
  // ve stálém horku ne (Jamajka ~28 / 24 °C)
  const peru = ctxOf(tenNights('02', { cc: 'PE' }), { climate: [at('LIM')] });
  assert.ok(peru.acts.has('hike') && !peru.actsChosen);
  assert.match(P.bagTips(peru)[0], layered);
  const jam = ctxOf(tenNights('01', { cc: 'JM' }), { climate: [at('MBJ')] });
  assert.ok(jam.acts.has('hike') && !jam.actsChosen, 'turistika podle štítku „vodopády“');
  assert.doesNotMatch(P.bagTips(jam)[0], /vrstvy/);
  assert.match(tip(tenNights('01', { cc: 'JM', pretrip: { acts: ['beach', 'hike'] } }), [at('MBJ')]), layered);
  // podnebí neznámé (a bez hor) → bez rady o vrstvách; krátká cesta → bez rady o balení vůbec
  assert.doesNotMatch(tip(tenNights('01', { cc: 'JP', pretrip: { acts: ['city'] } }), []), /vrstvy/);
  assert.equal(tip(trip({ cc: 'JP', out: '2027-01-05', back: '2027-01-08' }), [at('NRT')]), 'Letíš jen s malým zavazadlem pod sedadlo – rozměry ověř u aerolinky.');
});

test('aktivity: výchozí podle programu, země a podnebí; zvolené u cesty jen ze známých hodnot', () => {
  const plan = (cats) => ({ days: [{ date: '2027-07-11', items: cats.map((c) => ({ name: c, category: c })) }] });
  assert.deepEqual([...ctxOf(trip({ cc: 'AT', plan: plan(['museum', 'church']) }), { climate: [flat(25, 15, 80)] }).acts], ['city']);
  assert.deepEqual([...ctxOf(trip({ cc: 'AT', plan: plan(['nature']) }), { climate: [flat(25, 15, 80)] }).acts], ['hike']);
  assert.deepEqual([...ctxOf(trip({ cc: 'AT' }), { climate: [flat(25, 15, 80)] }).acts], ['hike', 'city'], 'bez programu město a hory podle země (Alpy)');
  assert.deepEqual([...ctxOf(trip({ cc: 'NL' }), { climate: [flat(20, 10, 80)] }).acts], ['city']);
  // sdílený odkaz: neznámé aktivity pryč
  const cx = ctxOf(trip({ pretrip: { acts: ['beach', '<img src=x>', 'snow', 'toString'] } }));
  assert.deepEqual([...cx.acts], ['beach', 'snow']);
  assert.equal(cx.actsChosen, true);
  // zakrytá ramena: kostely v programu
  assert.ok(itemIds(trip({ cc: 'IT', plan: plan(['church']) })).includes('cl-modest'));
  assert.ok(!itemIds(trip({ cc: 'IT', plan: plan(['museum']) })).includes('cl-modest'));
});

test('povinný online formulář k příletu: úkol „důležité“ s oficiálním odkazem, potvrzení do dokladů, připomínka; přestup a bez formuláře nic', () => {
  const th = trip({ cc: 'TH', label: 'Bangkok', out: '2027-02-10', back: '2027-02-24' });
  const f = byId(todo(th), 'form');
  assert.equal(f.level, 'must');
  assert.equal(f.title, 'Vyplň TDAC (Thailand Digital Arrival Card) – zdarma, nejdříve 72 h před příletem');
  assert.equal(f.short, 'online formulář TDAC');
  assert.deepEqual(plain(f.links), [['https://tdac.immigration.go.th', 'TDAC – oficiální web']]);
  assert.match(strip(f.lines.join(' ')), /Thajsko: TDAC \(Thailand Digital Arrival Card\) – zdarma, nejdříve 72 h před příletem\. Potvrzení \(QR kód\) měj v mobilu\./);
  assert.match(f.lines.join(' '), /zprostředkovatelé/);
  assert.deepEqual(plain(todo(th).map((x) => x.id).slice(0, 2)), ['ins', 'form'], 'hned za pojištěním');
  // víc zemí: jeden úkol se všemi formuláři; přestup v Singapuru bez vstupu ne
  const two = P.todos(ctxOf(th, { isos: ['TH', 'MY'], via: ['SG'] }));
  const f2 = byId(two, 'form');
  assert.equal(f2.title, 'Vyplň povinné online formuláře: TDAC, MDAC');
  assert.deepEqual(plain(f2.links).map((l) => l[1]), ['TDAC (Thajsko) – oficiální web', 'MDAC (Malajsie) – oficiální web']);
  assert.ok(!byId(todo(trip({ cc: 'ES' })), 'form'));
  assert.ok(!byId(P.todos(ctxOf(trip({ cc: 'ES' }), { via: ['TH'] })), 'form'), 'jen přestup');
  // Kosovo: registrace po příjezdu, odkaz na informace MZV, bez QR kódu
  const xk = byId(todo(trip({ cc: 'XK', label: 'Priština' })), 'form');
  assert.equal(xk.title, 'Vyplň registrace cizinců (u kosovské policie, online nebo na policii) – do 3 dnů po příjezdu');
  assert.match(xk.links[0][1], /informace MZV$/);
  assert.doesNotMatch(xk.lines.join(' '), /QR/);
  // seznam věcí: potvrzení v dokladech; Kosovo (registrace na místě) ne
  assert.ok(itemIds(th).includes('doc-arr-TH'));
  assert.equal(items(th).find((x) => x.id === 'doc-arr-TH').text, 'Potvrzení: TDAC (Thajsko)');
  assert.ok(!itemIds(trip({ cc: 'XK', label: 'Priština' })).some((x) => x.startsWith('doc-arr-')));
  assert.ok(!itemIds(trip({ cc: 'ES' })).some((x) => x.startsWith('doc-arr-')));
  // kalendář: TDAC 2 dny před odletem (okno 72 h před příletem), NZTD v den odletu, Kambodža 6 dní předem
  const ev = plain(P.reminders(th, { isos: ['TH'], climate: [], today: '2026-10-07' }));
  const tdac = ev.find((e) => e.uid === 'atlas-pretrip-form-TH-2027-02-10');
  assert.deepEqual([tdac.title, tdac.start, tdac.url], ['📝 Vyplnit TDAC (Thajsko)', '2027-02-08', 'https://tdac.immigration.go.th']);
  assert.match(tdac.description, /Jen na oficiálním webu: https:\/\/tdac\.immigration\.go\.th/);
  const nz = plain(P.reminders(trip({ cc: 'NZ', label: 'Auckland', out: '2027-02-10' }), { isos: ['NZ'], climate: [], today: '2026-10-07' })).find((e) => e.uid.startsWith('atlas-pretrip-form-'));
  assert.equal(nz.start, '2027-02-10');
  const kh = plain(P.reminders(trip({ cc: 'KH', label: 'Siem Reap', out: '2027-02-10' }), { isos: ['KH'], climate: [], today: '2026-10-07' })).find((e) => e.uid.startsWith('atlas-pretrip-form-'));
  assert.equal(kh.start, '2027-02-04');
  // karta: úkol důležitý (popis rovnou, ne pod „Podrobnosti“), odkaz na oficiální web
  const html = P.html(th, { isos: ['TH'], climate: [] });
  assert.match(html, /<li class="pt-item lv-must"><label class="pt-row"><input type="checkbox" data-ptk="todo:form" ><span class="pt-t">📝 <b>Vyplň TDAC \(Thailand Digital Arrival Card\)/);
  assert.match(html, /<a href="https:\/\/tdac\.immigration\.go\.th" target="_blank" rel="noopener">TDAC – oficiální web ↗<\/a>/);
});

/* ---------- připomínky, plánovač ---------- */
test('kalendář: pojištění 14 dní, MŘP 21 dní (jen když je nutný), DROZD 3 dny předem; pozdě = dnes, po odjezdu nic', () => {
  const t = trip({ cc: 'JP', label: 'Tokio', out: '2027-03-12', back: '2027-03-21', car: CAR });
  const ev = plain(P.reminders(t, { isos: ['JP'], climate: [], today: '2026-10-07' }));
  assert.deepEqual(ev.map((e) => [e.title, e.start, e.uid]), [
    ['🛡️ Sjednat cestovní pojištění (Japonsko)', '2027-02-26', 'atlas-pretrip-ins-2027-03-12'],
    ['🚘 Vyřídit mezinárodní řidičský průkaz (vzor 1949)', '2027-02-19', 'atlas-pretrip-idp-2027-03-12'],
    ['📝 Registrace v systému DROZD (Japonsko)', '2027-03-09', 'atlas-pretrip-drozd-2027-03-12'],
  ]);
  assert.equal(ev[0].url, PT.sources.desatero);
  assert.equal(ev[1].url, PT.sources.idp);
  assert.equal(ev[2].url, 'https://drozd.mzv.gov.cz/');
  assert.match(ev[1].description, /200 Kč/);
  assert.ok(ev.every((e) => !/\n\n/.test(e.description)));
  // Itálie s autem: jen pojištění (MŘP ani DROZD ne)
  assert.deepEqual(plain(P.reminders(trip({ cc: 'IT', car: CAR }), { isos: ['IT'], climate: [], today: '2026-10-07' })).map((e) => e.title), ['🛡️ Sjednat cestovní pojištění (Itálie)']);
  // pozdě: připomínky dnes; v den odjezdu žádné
  assert.deepEqual(plain(P.reminders(t, { isos: ['JP'], climate: [], today: '2027-03-11' })).map((e) => e.start), ['2027-03-11', '2027-03-11', '2027-03-11']);
  assert.deepEqual(plain(P.reminders(t, { isos: ['JP'], climate: [], today: '2027-03-12' })), []);
  // do .ics s pevnými UID (nový export událost přepíše)
  const ics = ctx.window.Ics.build(P.reminders(t, { isos: ['JP'], climate: [], today: '2026-10-07' }), { now: Date.UTC(2026, 9, 7) });
  assert.match(ics, /UID:atlas-pretrip-idp-2027-03-12\r\n/);
  assert.match(ics, /DTSTART;VALUE=DATE:20270219\r\n/);
});

test('plánovač: „Sbaleno“ = úkoly a věci na míru i s odškrtnutím, max 80 položek po 120 znacích', () => {
  const mem = new Map();
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
  const c = load({ storage });
  const t = trip({ cc: 'JP', label: 'Tokio', car: CAR });
  const key = c.window.PreTrip.tripKey(t);
  assert.equal(key, '1767225600000:2027-07-10:JP');
  c.window.PreTrip.setDone(key, 'todo:ins', true);
  c.window.PreTrip.setDone(key, 'pack:doc-pass', true);
  const list = plain(c.window.PreTrip.plannerChecklist(t, { isos: ['JP'], climate: [] }));
  assert.ok(list.length > 15 && list.length <= 80, String(list.length));
  assert.deepEqual(list[0], { t: 'Zařídit: cestovní pojištění', done: true, id: 'todo:ins' });
  assert.ok(list.some((x) => x.t === 'Zařídit: mezinárodní řidičský průkaz (vzor 1949)' && !x.done));
  // odškrtnuté „Zařídit: cestovní pojištění“ se do kalendáře nepřidá; řidičák (neodškrtnutý) ano
  const rem = plain(c.window.PreTrip.reminders(t, { isos: ['JP'], climate: [], today: '2026-10-07' })).map((e) => e.uid.replace(/-\d{4}-.*$/, ''));
  assert.ok(!rem.includes('atlas-pretrip-ins') && rem.includes('atlas-pretrip-idp'), rem.join());
  c.window.PreTrip.setDone(key, 'todo:drive', true);
  assert.ok(!plain(c.window.PreTrip.reminders(t, { isos: ['JP'], climate: [], today: '2026-10-07' })).some((e) => /idp/.test(e.uid)), 'MŘP odškrtnutý = bez připomínky');
  assert.ok(list.some((x) => x.t === 'Cestovní pas (občanský průkaz nestačí)' && x.done && x.id === 'pack:doc-pass'));
  assert.ok(list.every((x) => /^(todo|pack):[\w-]+$/.test(x.id)) && new Set(list.map((x) => x.id)).size === list.length, 'každá položka s vlastním id');
  assert.ok(list.every((x) => x.t.length <= 120 && !/["<>`]/.test(x.t)));
  assert.ok(!list.some((x) => /^Zařídit: peníze/.test(x.t)), 'informace bez úkolu ne');
  // prochází pročištěním sdíleného plánu beze změny (#plan=)
  const ps = { window: {}, TextEncoder, TextDecoder, btoa, atob };
  vm.createContext(ps);
  vm.runInContext(read('public/js/planshare.js'), ps);
  const back = plain(ps.window.PlanShare.decode(ps.window.PlanShare.encode({ name: 'Tokio', start: '2027-07-10', end: '2027-07-17', checklist: list })).checklist);
  assert.deepEqual(back.map((x) => x.t), list.map((x) => x.t));
});

test('plánovač ↔ průvodce: odškrtnutí v „Sbaleno“ uložené cesty a v „Co zařídit a co sbalit“ je totéž (i u seznamu bez id ze starší verze)', () => {
  const mem = new Map();
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
  const c = load({ storage });
  const P2 = c.window.PreTrip, o = { isos: ['JP'], climate: [] };
  // cesta z průvodce uložená v plánovači (tripId = created, wizard = kopie cesty) a táž otevřená zpět v průvodci (openSaved)
  const w = trip({ cc: 'JP', label: 'Tokio' });
  const saved = { name: 'Tokio 10.7.', tripId: w.created, wizard: { ...w, created: undefined }, checklist: plain(P2.plannerChecklist(w, o)) };
  const key = P2.tripKey(w);
  assert.equal(P2.savedKey(saved), key);
  assert.equal(P2.savedKey({ name: 'Jen plánovač', checklist: [] }), '', 'cesta bez průvodce');
  c.S.trips = [{ name: 'Jiná', checklist: [{ t: 'Zařídit: cestovní pojištění', done: false }] }, saved];
  let saves = 0;
  c.save = () => { saves++; };
  // plánovač → průvodce (app.js toggleCheck)
  const ins = saved.checklist.find((x) => x.id === 'todo:ins');
  ins.done = true; P2.fromPlanner(saved, ins);
  assert.equal(P2.doneOf(key)['todo:ins'], 1);
  assert.match(P2.html(w, o), /data-ptk="todo:ins" checked/);
  ins.done = false; P2.fromPlanner(saved, ins);
  assert.equal(P2.doneOf(key)['todo:ins'], undefined, 'zrušené odškrtnutí taky');
  // průvodce → plánovač (zaškrtávátko karty)
  assert.equal(P2.toPlanner(c.S.trips, key, 'pack:doc-pass', true), 1);
  assert.equal(saved.checklist.find((x) => x.id === 'pack:doc-pass').done, true);
  assert.equal(P2.toPlanner(c.S.trips, key, 'pack:doc-pass', true), 0, 'beze změny nic');
  assert.equal(c.S.trips[0].checklist[0].done, false, 'jiná cesta se nemění');
  assert.equal(P2.toPlanner(c.S.trips, 'jiny:klic', 'todo:ins', true), 0);
  // seznam uložený starší verzí (bez id) s odškrtnutím jen v plánovači: karta průvodce doplní id podle textu
  // a odškrtnuté sjednotí na obou stranách
  const old = { ...saved, checklist: saved.checklist.map((x) => ({ t: x.t, done: x.t === 'Zařídit: cestovní pojištění' })) };
  P2.setDone(key, 'pack:doc-pass', true);
  P2.setDone(key, 'todo:ins', false);
  c.S.trips = [old];
  saves = 0;
  const h = P2.html(w, o);
  assert.match(h, /data-ptk="todo:ins" checked/, 'z plánovače do průvodce');
  assert.ok(old.checklist.every((x) => /^(todo|pack):/.test(x.id)), 'id podle textu');
  assert.equal(old.checklist.find((x) => x.id === 'pack:doc-pass').done, true, 'z průvodce do plánovače');
  assert.ok(saves >= 1, 'uloženo');
  saves = 0; P2.html(w, o);
  assert.equal(saves, 0, 'podruhé už není co měnit');
  // vlastní položka plánovače (text bez protějšku) zůstane bez id
  old.checklist.push({ t: 'Dárek pro Janu', done: false });
  P2.html(w, o);
  assert.equal(old.checklist.at(-1).id, undefined);
});

test('plánovač ↔ průvodce: smazaná vlastní položka nepředá odškrtnutí další se stejným číslem (my-1)', () => {
  // vlastní položky se číslují nejmenším volným číslem – stará kopie v „Sbaleno“ plánovače spojila odškrtnutí s novou
  const c = load({ storage: memStorage() });
  const P2 = c.window.PreTrip, o = { isos: ['JP'], climate: [] };
  c.save = () => { };
  const w = trip({ cc: 'JP', label: 'Tokio' }), key = P2.tripKey(w);
  assert.equal(P2.addCustom(w, 'Powerbanka'), '');
  P2.setDone(key, 'pack:my-1', true);
  const saved = { name: 'Tokio', tripId: w.created, wizard: { ...plain(w), created: undefined }, checklist: plain(P2.plannerChecklist(w, o)) };
  c.S.trips = [saved];
  assert.equal(saved.checklist.find((x) => x.t === 'Powerbanka').id, 'pack:my-1');
  assert.equal(P2.delCustom(w, 'my-1'), true);
  P2.html(w, o); // překreslení karty
  assert.equal(P2.doneOf(key)['pack:my-1'], undefined, 'stará kopie v plánovači odškrtnutí nevrátí');
  assert.equal(P2.addCustom(w, 'Deštník'), '');
  assert.equal(w.pretrip.custom[0].id, 'my-1');
  assert.doesNotMatch(P2.html(w, o), /data-ptk="pack:my-1" checked/, 'nová položka není odškrtnutá');
  assert.equal(P2.toPlanner(c.S.trips, key, 'pack:my-1', true), 0, 'nová položka nepřepíná „Powerbanku“ v plánovači');
  assert.equal(saved.checklist.find((x) => x.t === 'Powerbanka').done, true);
  // stejný text u vlastní položky ze starší verze bez id se spojí dál
  const w2 = trip({ cc: 'JP', label: 'Tokio', created: 1767225600001 }), key2 = P2.tripKey(w2);
  P2.addCustom(w2, 'Kindle');
  const s2 = { name: 'Tokio 2', tripId: w2.created, wizard: { ...plain(w2), created: undefined }, checklist: [{ t: 'Kindle', done: true }] };
  c.S.trips = [s2];
  assert.match(P2.html(w2, o), /data-ptk="pack:my-1" checked/);
  assert.equal(s2.checklist[0].id, 'pack:my-1');
  assert.equal(P2.doneOf(key2)['pack:my-1'], 1);
});

test('💾 záloha a 📲 přenos: id položek „Sbaleno“ zůstanou – zrušené odškrtnutí v plánovači se po otevření v průvodci nevrátí', () => {
  const { c, Trip } = wizard(memStorage());
  vm.runInContext(read('public/js/planshare.js'), c, { filename: 'planshare.js' });
  vm.runInContext(read('public/js/backup.js'), c, { filename: 'backup.js' });
  const B = c.window.Backup, P2 = c.window.PreTrip, o = { isos: ['JP'], climate: [] };
  const deps = { sanitizePlan: c.window.PlanShare.sanitize, sanitizeWizard: Trip.sanitizeTrip, txt: c.window.PlanShare.txt };
  const t = tokyo(), key = P2.tripKey(t);
  P2.setDone(key, 'todo:ins', true);
  const entry = { name: 'Tokio', dest: 'Tokio', iso: 'JP', start: '2027-03-12', end: '2027-03-21', pax: '2', tripId: t.created, wizard: plain(t), checklist: plain(P2.plannerChecklist(t, o)) };
  const inc = B.parse(B.pack({ trips: [entry] }, P2.exportDone()), deps);
  const ins = inc.trips[0].checklist.find((x) => x.t === 'Zařídit: cestovní pojištění');
  assert.deepEqual(plain(ins), { t: 'Zařídit: cestovní pojištění', done: true, id: 'todo:ins' }, 'id přežije zálohu');
  // jen platná id; #plan= (json) dál bez nich
  assert.equal(c.window.PlanShare.sanitize({ name: 'x', checklist: [{ t: 'a', done: false, id: 'javascript:x' }] }).checklist[0].id, undefined);
  // nové zařízení: v plánovači zrušit odškrtnutí → v průvodci taky; karta průvodce ho nevrátí
  c.S.trips = [inc.trips[0]];
  ins.done = false; P2.fromPlanner(inc.trips[0], ins);
  P2.html(t, o);
  assert.equal(ins.done, false);
  // starší záloha bez id: cesta není „změněná“ jen kvůli id
  const noIds = { ...entry, checklist: entry.checklist.map(({ id, ...x }) => x) };
  assert.deepEqual(plain(B.diff({ trips: [entry] }, B.parse(B.pack({ trips: [noIds] }), deps), { deps }).trips), { add: 0, same: 1, changed: 0 });
});

test('odškrtnutí: localStorage pro každou cestu, nejvýš 30 cest, rozbité nebo zakázané úložiště nevadí', () => {
  const mem = new Map();
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
  const c = load({ storage });
  const P2 = c.window.PreTrip;
  P2.setDone('a', 'pack:x', true);
  P2.setDone('b', 'pack:y', true);
  assert.deepEqual(plain(P2.doneOf('a')), { 'pack:x': 1 });
  P2.setDone('a', 'pack:x', false);
  assert.deepEqual(plain(P2.doneOf('a')), {});
  for (let i = 0; i < 40; i++) P2.setDone(`t${i}`, 'pack:x', true);
  assert.equal(Object.keys(JSON.parse(mem.get('atlas_pretrip_v1'))).length, 30);
  mem.set('atlas_pretrip_v1', '{rozbité');
  assert.deepEqual(plain(P2.doneOf('t39')), {});
  // úložiště, které hází výjimku (anonymní okno, zakázané cookies)
  const bad = load({ storage: { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } } });
  assert.doesNotThrow(() => bad.window.PreTrip.setDone('a', 'pack:x', true));
  assert.deepEqual(plain(bad.window.PreTrip.doneOf('a')), {});
  // bez localStorage vůbec (testy bez prohlížeče)
  assert.deepEqual(plain(P.doneOf('a')), {});
  assert.ok(P.html(trip({ cc: 'JP' }), { isos: ['JP'], climate: [] }).includes('id="preTrip"'));
});

/* ---------- vykreslení ---------- */
test('karta: oddíly, zaškrtávátka, aktivity, podnebí a zdroje; odškrtnuté z úložiště', () => {
  const mem = new Map();
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
  const c = load({ storage });
  const t = trip({ cc: 'JP', label: 'Tokio (NRT)', out: '2027-03-12', back: '2027-03-21', car: CAR });
  c.window.PreTrip.setDone(c.window.PreTrip.tripKey(t), 'pack:doc-pass', true);
  const h = sp(c.window.PreTrip.html(t, { isos: ['JP'], climate: [at('NRT', 'Tokio')] }));
  assert.match(h, /^<div class="card step-card pt-card" id="preTrip" data-ptkey="1767225600000:2027-03-12:JP">/);
  assert.match(h, /<h3>🧭 Co zařídit a co sbalit<\/h3><div class="muted pt-sub">Japonsko · 12\. 3\. – 21\. 3\. 2027 · 10 dní · let jen s malým zavazadlem · auto na místě<\/div>/);
  assert.match(h, /<h4>📋 Co zařídit<\/h4>/);
  assert.match(h, /<h4>🎒 Co sbalit<\/h4>/);
  assert.match(h, /<input type="checkbox" data-ptk="todo:ins" >/);
  assert.match(h, /<input type="checkbox" data-ptk="pack:doc-pass" checked>/);
  assert.match(h, /<li class="done"><label class="pt-row"><input type="checkbox" data-ptk="pack:doc-pass" checked><span>Cestovní pas <span class="faint">– občanský průkaz nestačí<\/span><\/span><\/label><\/li>/);
  assert.match(h, /<button type="button" class="fchip on" data-pt-act="city" aria-pressed="true">🏙️ Města a památky<\/button>/);
  assert.match(h, /<button type="button" class="fchip" data-pt-act="beach" aria-pressed="false">/);
  assert.match(h, /🌡️ <b>Tokio<\/b>: přes den ~13 °C, v noci ~6 °C, srážky do ~106 mm za měsíc/);
  // °C a mm s pevnou mezerou (h je bez nich) – na telefonu se jednotka neodtrhne od čísla
  assert.match(c.window.PreTrip.html(t, { isos: ['JP'], climate: [at('NRT', 'Tokio')] }), /přes den ~13\u00a0°C, v noci ~6\u00a0°C, srážky do ~106\u00a0mm za měsíc/);
  assert.match(h, /data-pt-print>🖨️ Vytisknout<\/button>/);
  assert.match(h, /✔ 1\/\d+/);
  assert.match(h, /Informativní přehled \(stav 10\/2026\)/);
  // informace bez úkolu (měna) bez zaškrtávátka
  assert.doesNotMatch(h, /data-ptk="todo:money"/);
  assert.match(h, /<span class="pt-dot" aria-hidden="true">ℹ️<\/span><span class="pt-t">💶 <b>Měna: japonský jen \(JPY\)<\/b>/);
  // cesta bez země (jen Česko) → nic
  assert.equal(P.html(trip({ cc: 'CZ' }), { isos: ['CZ'], climate: [] }), '');
  // data ještě nejsou → zástupná karta (načte se a překreslí sama)
  const empty = load({ data: null });
  assert.match(empty.window.PreTrip.html(trip(), { isos: ['ES'] }), /Připravuji seznam…/);
});

test('karta: data se nepodařilo načíst → upozornění a žádné další pokusy dokola', async () => {
  const c = load({ data: null });
  const calls = [];
  c.fetch = (url) => { calls.push(String(url)); return Promise.resolve({ ok: false, status: 404, json: async () => ({}) }); };
  assert.match(c.window.PreTrip.html(trip(), { isos: ['ES'] }), /Připravuji seznam…/);
  assert.deepEqual(calls, ['data/pretrip.json']);
  await assert.rejects(c.window.PreTrip.load(), /HTTP 404/); // tentýž rozběhnutý požadavek
  const h = c.window.PreTrip.html(trip(), { isos: ['ES'] });
  assert.match(h, /Seznam se nepodařilo načíst/);
  c.window.PreTrip.html(trip(), { isos: ['ES'] });
  assert.equal(calls.length, 1, 'vykreslení po chybě znovu nenačítá');
  // podaří se → karta
  c.fetch = async () => ({ ok: true, json: async () => JSON.parse(JSON.stringify(PT)) });
  await c.window.PreTrip.load();
  assert.match(c.window.PreTrip.html(trip(), { isos: ['ES'], climate: [] }), /<h4>📋 Co zařídit<\/h4>/);
});

test('karta: texty z dat, cesty i sdíleného odkazu escapované, odkazy jen http(s)', () => {
  const data = JSON.parse(JSON.stringify(PT));
  data.driving.JP = { n: 'req', f: '1949', t: '<img src=x onerror=alert(1)>', s: 'javascript:alert(1)' };
  data.health.contract.TR = '"><script>alert(2)</script> CZ/TR 111';
  data.sources.drozd = 'javascript:alert(3)';
  data.plugs.JP = { t: 'A,B', v: '100', hz: '<b>x</b>' };
  const c = load({ data });
  vm.runInContext("byIso.JP = { ...byIso.JP, cs: '<i>Japonsko</i>', cur: '<s>' };", c);
  const t = trip({ cc: 'JP', label: '<img src=y onerror=alert(4)>', car: CAR, pretrip: { acts: ['<b>', 'beach'] } });
  t.created = '"><script>';
  const h = c.window.PreTrip.html(t, { isos: ['JP', 'TR'], climate: [flat(30, 20, 10, '<script>alert(5)</script>')] });
  assert.ok(h.includes('id="preTrip"'));
  assert.ok(!/<img|<script|javascript:|<b>x<|<i>Japonsko|<s>/i.test(h), h.slice(0, 400));
  assert.match(h, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(h, /data-ptkey="0:2027-07-10:JP"/);
  for (const m of h.matchAll(/href="([^"]*)"/g)) assert.match(m[1], /^https?:\/\//, m[1]);
  // připomínky a plánovač také bez HTML
  const ev = plain(c.window.PreTrip.reminders(t, { isos: ['JP'], climate: [], today: '2026-10-07' }));
  assert.ok(ev.every((e) => e.url === undefined || /^https:\/\//.test(e.url)));
});

/* ---------- průvodce cestou ---------- */
test('průvodce: shrnutí má kartu „Co zařídit a co sbalit“, kalendář připomínky, plánovač seznam na míru', () => {
  const c = load({ withTrip: true });
  const host = { innerHTML: '' }, root = { innerHTML: '' }, els = {};
  vm.runInContext('var $ = (s) => (s === "#tripRoot" ? __root : s === "#tripStep" ? __host : (__els[s] ||= { innerHTML: "", value: "" })); var $$ = () => []; var go = () => {}; var toast = () => {}; var save = () => {}; var fmtYMD2 = 1;', c);
  c.__root = root; c.__host = host; c.__els = els;
  c.S.trips = [];
  // termín vždy ~5 měsíců dopředu – připomínky v kalendáři se dávají jen na budoucí dny (test nesmí zastarat)
  const day = (n) => { const d = new Date(Date.now() + n * 864e5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const [o, b] = [day(150), day(159)];
  const t = { ...trip({ cc: 'JP', label: 'Tokio', out: o, back: b, car: { mode: 'manual', totalCzk: 9000, pickup: 'NRT', dropoff: 'NRT', from: `${day(151)}T10:00`, to: `${b}T08:00` } }), dest: { label: 'Tokio', country: 'Japonsko', cc: 'JP', lat: 35.7, lon: 139.7 } };
  t.flight.out.to = 'NRT'; t.flight.back.from = 'NRT';
  c.S.trip = t;
  c.window.Trip.render();
  const h = sp(host.innerHTML);
  const i = h.indexOf('<h3>🛂 Před cestou</h3>'), j = h.indexOf('id="preTrip"'), k = h.indexOf('🗓️ Průběh cesty');
  assert.ok(i > 0 && j > i && k > j, 'pod vstupními podmínkami, před průběhem cesty');
  assert.match(h, /Vyřiď mezinárodní řidičský průkaz \(vzor 1949\)/);
  const ev = plain(c.window.Trip.calendarEvents(t)).filter((e) => /^(🛡️|🚘|📝)/u.test(e.title)).map((e) => e.title);
  assert.deepEqual(ev, ['🛡️ Sjednat cestovní pojištění (Japonsko)', '🚘 Vyřídit mezinárodní řidičský průkaz (vzor 1949)', '📝 Registrace v systému DROZD (Japonsko)']);
  // „💾 Uložit do plánovače“ → „Sbaleno“ z „Před cestou“
  els['#sumSave'].onclick();
  const saved = c.S.trips.at(-1);
  assert.ok(saved.checklist.some((x) => x.t === 'Zařídit: mezinárodní řidičský průkaz (vzor 1949)'), JSON.stringify(saved.checklist.slice(0, 5)));
  assert.ok(!saved.checklist.some((x) => x.t === 'Pas / OP'), 'obecný seznam jen bez dat');
  // sdílený odkaz nese zvolené aktivity (t.pretrip) jen ze známých hodnot (odškrtnutí a vlastní položky v testech níže)
  const shared = c.window.Trip.sanitizeTrip(JSON.parse(JSON.stringify({ ...t, pretrip: { acts: ['beach', '<x>'] } })));
  assert.deepEqual([...c.window.PreTrip.contextOf(shared, { climate: [] }).acts], ['beach']);
});

/** localStorage v paměti. */
const memStorage = () => { const mem = new Map(); return { mem, getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) }; };
/** Průvodce cestou v node:vm jako v prohlížeči: shrnutí do falešných prvků (tlačítka v els), adresa, historie a schránka. */
function wizard(storage, hash = '') {
  const c = load({ withTrip: true, storage });
  const els = {};
  vm.runInContext('var $ = (s) => (s === "#tripRoot" ? __root : s === "#tripStep" ? __host : (__els[s] ||= { innerHTML: "", value: "" })); var $$ = () => []; var go = () => {}; var toast = () => {}; var save = () => {};', c);
  Object.assign(c, { __root: { innerHTML: '' }, __host: { innerHTML: '' }, __els: els, confirm: () => true, copied: [] });
  c.location = { origin: 'https://atlas.example', pathname: '/', hash };
  c.history = { replaceState: (s, title, h) => { c.location.hash = h; } };
  c.navigator = { clipboard: { writeText: (u) => { c.copied.push(u); return Promise.resolve(); } } };
  c.S.trips = [];
  return { c, els, P: c.window.PreTrip, Trip: c.window.Trip };
}
/** Cesta do Tokia tak, jak ji uloží průvodce (s polohou cíle a letištěm). */
function tokyo() {
  const t = { ...trip({ cc: 'JP', label: 'Tokio', out: '2027-03-12', back: '2027-03-21' }), dest: { label: 'Tokio', country: 'Japonsko', cc: 'JP', lat: 35.7, lon: 139.7 } };
  t.flight.out.to = 'NRT'; t.flight.back.from = 'NRT';
  return t;
}
const tripHash = (t) => '#trip=' + Buffer.from(JSON.stringify(t)).toString('base64url');
/** JSON ze sdíleného odkazu na cestu: zkomprimovaný („z“ + deflate-raw) i dřívější base64url JSON. */
const sentOf = (url) => {
  const p = url.split('#trip=')[1];
  return JSON.parse((p[0] === 'z' ? inflateRawSync(Buffer.from(p.slice(1), 'base64url')) : Buffer.from(p, 'base64url')).toString('utf8'));
};

test('sdílený odkaz na cestu (#trip=): odškrtnutí a vlastní položky tam a zpět, odškrtnutí jiných cest příjemce zůstanou, starší odkazy', async () => {
  // odesílatel: dvě odškrtnutí, dvě vlastní položky (druhá odškrtnutá), zvolené aktivity
  const a = wizard(memStorage());
  const t = tokyo();
  a.c.S.trip = t;
  assert.equal(a.P.addCustom(t, 'Nabíječka na hodinky'), '');
  assert.equal(a.P.addCustom(t, 'Dárek pro Keiko'), '');
  t.pretrip.acts = ['city', 'hike'];
  const key = a.P.tripKey(t);
  for (const id of ['todo:ins', 'pack:doc-pass', 'pack:my-2']) a.P.setDone(key, id, true);
  a.Trip.render();
  await a.els['#sumShare'].onclick();
  const url = a.c.copied[0];
  assert.match(url, /^https:\/\/atlas\.example\/#trip=z[A-Za-z0-9_-]+$/, 'zkomprimovaný odkaz');
  const sent = sentOf(url);
  assert.ok(url.length < tripHash(sent).length * 0.6, `kratší než dřív: ${url.length} vs ${tripHash(sent).length}`);
  const custom = [{ id: 'my-1', text: 'Nabíječka na hodinky' }, { id: 'my-2', text: 'Dárek pro Keiko' }];
  assert.deepEqual(sent.pretrip, { acts: ['hike', 'city'], custom, done: ['todo:ins', 'pack:doc-pass', 'pack:my-2'] });
  assert.equal(sent.created, undefined);
  assert.equal(t.pretrip.done, undefined, 'odesílateli se cesta nemění');
  // příjemce: jiný prohlížeč s odškrtnutím jiné cesty
  const st = memStorage();
  st.setItem('atlas_pretrip_v1', JSON.stringify({ 'jina:cesta': { d: { 'pack:cl-hat': 1 }, at: 1 } }));
  const b = wizard(st, url.slice(url.indexOf('#')));
  assert.equal(await b.Trip.importFromHash(), true);
  const got = b.c.S.trip;
  assert.equal(b.c.location.hash, '#trip');
  assert.deepEqual(plain(got.pretrip), { acts: ['hike', 'city'], custom }, 'odškrtnutí se z cesty přesunula do localStorage');
  assert.notEqual(b.P.tripKey(got), key, 'nová cesta má vlastní klíč');
  assert.deepEqual(Object.keys(plain(b.P.doneOf(b.P.tripKey(got)))).sort(), ['pack:doc-pass', 'pack:my-2', 'todo:ins']);
  assert.deepEqual(plain(b.P.doneOf('jina:cesta')), { 'pack:cl-hat': 1 }, 'odškrtnutí jiné cesty příjemce zůstala');
  // karta u příjemce: odškrtnuté položky i vlastní položky
  const h = sp(b.P.html(got, { isos: ['JP'], climate: [] }));
  assert.match(h, /data-ptk="todo:ins" checked/);
  assert.match(h, /data-ptk="pack:doc-pass" checked/);
  assert.match(h, /<li class="pt-own"><label class="pt-row"><input type="checkbox" data-ptk="pack:my-1" ><span>Nabíječka na hodinky<\/span>/);
  assert.match(h, /<li class="pt-own done"><label class="pt-row"><input type="checkbox" data-ptk="pack:my-2" checked><span>Dárek pro Keiko<\/span>/);
  assert.match(h, /✔ 3\/\d+/);
  // a sdílí je dál (z localStorage své cesty)
  assert.deepEqual(plain(b.P.shareState(got)).done.sort(), ['pack:doc-pass', 'pack:my-2', 'todo:ins']);
  // starší odkaz bez stavu karty, nebo jen s aktivitami: funguje dál, nic odškrtnuté
  const old = wizard(memStorage(), tripHash({ ...sent, pretrip: undefined }));
  assert.equal(await old.Trip.importFromHash(), true);
  assert.equal(old.c.S.trip.pretrip, undefined);
  assert.deepEqual(plain(old.P.doneOf(old.P.tripKey(old.c.S.trip))), {});
  const acts = wizard(memStorage(), tripHash({ ...sent, pretrip: { acts: ['beach'] } }));
  assert.equal(await acts.Trip.importFromHash(), true);
  assert.deepEqual(plain(acts.c.S.trip.pretrip), { acts: ['beach'] });
  // nic k sdílení → odkaz bez pole
  const n = wizard(memStorage());
  n.c.S.trip = tokyo();
  n.Trip.render();
  await n.els['#sumShare'].onclick();
  assert.equal(sentOf(n.c.copied[0]).pretrip, undefined);
});

test('sdílený odkaz na cestu: podvržený stav karty – jen známé aktivity, pročištěné vlastní položky, id odškrtnutí ve známém tvaru, omezené počty', async () => {
  const b = wizard(memStorage());
  const evil = {
    acts: ['beach', '<img src=x onerror=alert(1)>', 'snow', 'toString', '__proto__'],
    custom: [
      { id: 'my-1', text: '<img src=x onerror=alert(1)>Nabíječka & kabel' }, { id: 'my-1', text: 'stejné id podruhé' }, { id: '__proto__', text: 'x' },
      { id: 'my-2', text: 'a'.repeat(500) }, { id: 'my-3', text: '   ' }, { id: 'my-4', text: { toString: 'x' } }, { id: 'my-5"><b>', text: 'x' }, 'jen text', null,
      ...Array.from({ length: 100 }, (_, i) => ({ id: `my-${i + 10}`, text: `věc ${i}` })),
    ],
    done: [
      'todo:ins', 'pack:doc-pass', 'pack:my-1', 'pack:my-999', '"><script>alert(1)</script>', 'todo:__proto__', 'constructor', 'pack:doc pass', 'javascript:alert(1)', { id: 'todo:ins' }, 'todo:ins',
      ...Array.from({ length: 500 }, (_, i) => `pack:cl-x${i}`),
    ],
    html: '<b>navíc</b>', d: { 'todo:ins': 1 },
  };
  // „__proto__“ jako vlastní klíč (JSON.parse ho tak vytvoří) – nesmí se stát prototypem
  const json = JSON.stringify({ ...tokyo(), pretrip: evil }).replace('"pretrip":{', '"pretrip":{"__proto__":{"polluted":true},');
  const t = b.Trip.sanitizeTrip(JSON.parse(json));
  assert.deepEqual(Object.keys(t.pretrip).sort(), ['acts', 'custom', 'done']);
  assert.equal({}.polluted, undefined);
  assert.equal(t.pretrip.polluted, undefined);
  assert.deepEqual(plain(t.pretrip.acts), ['beach', 'snow']);
  assert.equal(t.pretrip.custom.length, 30, 'nejvýš 30 vlastních položek');
  assert.deepEqual(plain(t.pretrip.custom.slice(0, 3)), [{ id: 'my-1', text: 'img src=x onerror=alert(1)Nabíječka & kabel' }, { id: 'my-2', text: 'a'.repeat(80) }, { id: 'my-10', text: 'věc 0' }]);
  assert.ok(t.pretrip.custom.every((x) => /^my-\d+$/.test(x.id) && x.text.length <= 80 && !/[<>"'`]/.test(x.text)));
  // odškrtnutí: známý tvar, bez duplicit, jen vlastní položky, které cesta má; obecné pročištění odkazu bere nejvýš 200 prvků pole
  assert.deepEqual(plain(t.pretrip.done.slice(0, 4)), ['todo:ins', 'pack:doc-pass', 'pack:my-1', 'pack:cl-x0']);
  assert.equal(t.pretrip.done.length, 3 + 189);
  assert.ok(t.pretrip.done.every((id) => /^(todo|pack):[\w-]+$/.test(id)));
  // samotné pročištění stavu karty: nejvýš 200 odškrtnutí
  assert.equal(b.P.sanitize({ done: Array.from({ length: 500 }, (_, i) => `pack:cl-x${i}`) }).done.length, 200);
  for (const bad of ['<b>', 5, ['beach'], null, {}, { acts: 'beach', custom: 'x', done: 'todo:ins' }]) assert.equal(b.P.sanitize(bad), undefined, JSON.stringify(bad));
  // import: odškrtnutí jen pod klíčem nové cesty, karta bez HTML z odkazu
  const imp = wizard(memStorage(), '#trip=' + Buffer.from(json).toString('base64url'));
  assert.equal(await imp.Trip.importFromHash(), true);
  const got = imp.c.S.trip;
  assert.equal(got.pretrip.done, undefined);
  const stored = JSON.parse(imp.c.localStorage.getItem('atlas_pretrip_v1'));
  assert.deepEqual(Object.keys(stored), [imp.P.tripKey(got)]);
  assert.equal(Object.keys(stored[imp.P.tripKey(got)].d).length, 192);
  const h = imp.P.html(got, { isos: ['JP'], climate: [] });
  assert.ok(!/<img|<script|<b>navíc/i.test(h));
  assert.match(h, /<span>img src=x onerror=alert\(1\)Nabíječka &amp; kabel<\/span>/);
  // neplatný stav karty (ne objekt) → cesta bez něj, import projde
  for (const bad of ['<b>', 5, ['beach'], null]) assert.equal(b.Trip.sanitizeTrip(JSON.parse(JSON.stringify({ ...tokyo(), pretrip: bad }))).pretrip, undefined);
});

test('vlastní odkaz na cestu otevřený v tomtéž prohlížeči: bez otázky, odškrtnuté rezervace i čas založení zůstanou (plánovač bez kopie)', async () => {
  const st = memStorage();
  const a = wizard(st);
  const t = { ...tokyo(), stay: { mode: 'pick', id: 'h1', name: 'Hotel Sakura', totalCzk: 20000, url: 'https://hotel.example/s' }, booked: { flight0: true } };
  a.c.S.trip = t;
  a.Trip.render();
  a.els['#sumSave'].onclick();
  await a.els['#sumShare'].onclick();
  const hash = a.c.copied[0].slice(a.c.copied[0].indexOf('#'));
  const open = (mine, ok, storage = memStorage()) => {
    const b = wizard(storage, hash);
    b.c.S.trip = mine && JSON.parse(JSON.stringify(mine));
    b.c.S.trips = JSON.parse(JSON.stringify(a.c.S.trips));
    b.asked = 0;
    b.c.confirm = () => { b.asked++; return ok; };
    return b;
  };
  // tatáž cesta (lety, lidé, hotel): žádná otázka, rozpracovaná cesta zůstane i s odškrtnutím a časem založení
  const b = open(t, false, st);
  assert.equal(await b.Trip.importFromHash(), true);
  assert.deepEqual([b.asked, b.c.S.trip.created, plain(b.c.S.trip.booked), b.c.S.trip.step, b.c.location.hash], [0, t.created, { flight0: true }, 'summary', '#trip']);
  b.Trip.render();
  b.els['#sumSave'].onclick();
  assert.deepEqual(b.c.S.trips.map((x) => x.tripId), [t.created], 'znovu uložená cesta se aktualizuje, ne zdvojí');
  // stejné lety, ale jiný hotel: otázka; bez souhlasu zůstane rozpracovaná cesta
  const other = { ...t, stay: { mode: 'manual', name: 'U kamaráda', totalCzk: 5000 } };
  const c2 = open(other, false);
  assert.equal(await c2.Trip.importFromHash(), false);
  assert.deepEqual([c2.asked, c2.c.S.trip.stay.name], [1, 'U kamaráda']);
  // bez rozpracovaného (jen vybraný let): sdílená cesta bez otázky, jako výběr letu z výsledků
  const d = open({ ...tokyo(), created: 5 }, false);
  assert.equal(await d.Trip.importFromHash(), true);
  assert.deepEqual([d.asked, d.c.S.trip.stay.name, plain(d.c.S.trip.booked)], [0, 'Hotel Sakura', {}]);
  assert.notEqual(d.c.S.trip.created, 5);
});

test('novější odkaz na tutéž cestu (spolucestující poslal program a odškrtnutí): otázka, po souhlasu nová verze se starými rezervacemi i časem založení', async () => {
  // A: hotel → odkaz v1 (bez programu)
  const a = wizard(memStorage());
  const t = { ...tokyo(), stay: { mode: 'pick', id: 'h1', name: 'Hotel Sakura', totalCzk: 20000, url: 'https://hotel.example/s' } };
  a.c.S.trip = t;
  const link = async () => { a.c.copied.length = 0; a.Trip.render(); await a.els['#sumShare'].onclick(); return a.c.copied[0].slice(a.c.copied[0].indexOf('#')); };
  const v1 = await link();
  // B: každé otevření odkazu = nové načtení stránky se stejným úložištěm a rozpracovanou cestou
  const st = memStorage();
  let mine = null;
  const open = async (hash, ok = false) => {
    const b = wizard(st, hash);
    b.c.S.trip = mine && JSON.parse(JSON.stringify(mine));
    const asked = [];
    b.c.confirm = (m) => { asked.push(m); return ok; };
    const r = await b.Trip.importFromHash();
    mine = plain(b.c.S.trip);
    return { r, asked, b };
  };
  let o = await open(v1);
  assert.deepEqual([o.r, o.asked.length, mine.stay.name, mine.plan], [true, 0, 'Hotel Sakura', null]);
  const created = mine.created;
  mine.booked = { flight0: true };
  o.b.P.setDone(o.b.P.tripKey(mine), 'pack:doc-pass', true); // B si odškrtne vlastní položku
  // tentýž odkaz znovu (i s vlastním odškrtnutím navíc): nic nového → bez otázky, beze změny
  o = await open(v1);
  assert.deepEqual([o.r, o.asked.length, mine.created, mine.booked], [true, 0, created, { flight0: true }]);
  // A sestaví program a odškrtne pojištění → odkaz v2 (stejné lety, lidé i hotel)
  t.plan = { center: { lat: 35.68, lon: 139.76 }, days: [{ date: '2027-03-13', cap: 360, items: [{ id: 'q1', name: 'Sensódži', lat: 35.71, lon: 139.79, category: 'sight', visitMin: 60 }] }] };
  a.P.setDone(a.P.tripKey(t), 'todo:ins', true);
  const v2 = await link();
  // bez souhlasu zůstane rozpracovaná cesta
  o = await open(v2, false);
  assert.equal(o.r, false);
  assert.match(o.asked[0], /^Odkaz je na tvoji rozpracovanou cestu \(Tokio\), ale v jiné podobě \(např\. s jiným programem\)\. Nahradit ji verzí z odkazu\?/);
  assert.deepEqual([mine.plan, o.b.c.location.hash], [null, '#trip']);
  // se souhlasem: program z odkazu; rezervace i čas založení zůstanou (plánovač cestu aktualizuje), odškrtnutí karty se sečtou
  o = await open(v2, true);
  assert.deepEqual([o.r, o.asked.length, mine.plan.days[0].items[0].name, mine.created, mine.booked, mine.step], [true, 1, 'Sensódži', created, { flight0: true }, 'summary']);
  assert.deepEqual(Object.keys(plain(o.b.P.doneOf(o.b.P.tripKey(mine)))).sort(), ['pack:doc-pass', 'todo:ins']);
  // v2 podruhé → už bez otázky
  o = await open(v2);
  assert.deepEqual([o.r, o.asked.length], [true, 0]);
  // tatáž cesta bez rozpracovaného (jen let) a odkaz s programem: bez otázky, s časem založení
  a.c.S.trip = { ...tokyo(), plan: t.plan };
  const v3 = await link();
  mine = { ...plain(tokyo()), created: 7 };
  o = await open(v3);
  assert.deepEqual([o.r, o.asked.length, mine.created, mine.plan.days.length], [true, 0, 7, 1]);
});

test('sdílená cesta (#trip=): den sdílení v odkazu, u příjemce poznámka o stáří cen a 💾 Uložit si ji → vlastní cesta; starší odkazy', async () => {
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = ymd(new Date()), dm = (s) => `${+s.slice(8, 10)}. ${+s.slice(5, 7)}.`;
  // odesílatel: odkaz nese den sdílení (jen den – připravený odkaz je stejný jako ten po kliknutí)
  const a = wizard(memStorage());
  const t = { ...tokyo(), stay: { mode: 'pick', id: 'h1', name: 'Hotel Sakura', totalCzk: 20000, url: 'https://hotel.example/s' } };
  a.c.S.trip = t;
  a.Trip.render();
  assert.ok(!sp(a.c.__root.innerHTML).includes('Sdílená cesta'), 'vlastní cesta bez poznámky');
  await a.els['#sumShare'].onclick();
  const url = a.c.copied[0], sent = sentOf(url);
  assert.equal(sent.sharedOn, today);
  assert.equal(sent.shared, undefined);
  // příjemce: sdílená cesta s poznámkou a tlačítkem v každém kroku
  const b = wizard(memStorage(), url.slice(url.indexOf('#')));
  assert.equal(await b.Trip.importFromHash(), true);
  assert.deepEqual(plain(b.c.S.trip.shared), { on: today });
  assert.equal(b.c.S.trip.sharedOn, undefined, 'den sdílení jen v příznaku');
  b.Trip.render();
  const h = sp(b.c.__root.innerHTML);
  assert.match(h, new RegExp(`<b>Sdílená cesta</b> – ceny jsou z doby sdílení \\(${dm(today).replace(/\./g, '\\.')}\\)\\. Před nákupem je ověř\\.`));
  assert.match(h, /id="tripSharedSave">💾 Uložit si ji</);
  // 💾 Uložit si ji = uložení do plánovače (stejná cesta jako ve Shrnutí); pak vlastní cesta bez poznámky
  b.els['#tripSharedSave'].onclick();
  assert.equal(b.c.S.trips.length, 1);
  assert.equal(b.c.S.trips[0].dest, 'Tokio');
  assert.equal(b.c.S.trip.shared, undefined);
  assert.ok(!JSON.stringify(b.c.S.trips[0].wizard).includes('shared'), 'do plánovače příznak nepatří');
  b.Trip.render();
  assert.ok(!sp(b.c.__root.innerHTML).includes('Sdílená cesta'));
  // … a sdílí ji dál jako svou: odkaz bez příznaku, s dnešním dnem
  b.c.copied.length = 0;
  await b.els['#sumShare'].onclick();
  assert.deepEqual([sentOf(b.c.copied[0]).shared, sentOf(b.c.copied[0]).sharedOn], [undefined, today]);
  b.els['#sumSave'].onclick();
  assert.equal(b.c.S.trips.length, 1, 'znovu uložená se aktualizuje, ne zdvojí');
  // starší odkaz bez dne sdílení: „ceny se mohly změnit“; den z budoucnosti nebo nesmysl jako starší odkaz
  for (const on of [undefined, '2999-01-01', '<b>', 5, '2026-02-30']) {
    const o = wizard(memStorage(), tripHash({ ...sent, sharedOn: on }));
    assert.equal(await o.Trip.importFromHash(), true);
    assert.deepEqual(plain(o.c.S.trip.shared), { on: null }, String(on));
    o.Trip.render();
    assert.match(sp(o.c.__root.innerHTML), /<b>Sdílená cesta<\/b> – ceny se mohly změnit\. Před nákupem je ověř\./);
  }
  // podvržený příznak v odkazu se nepřevezme – den sdílení jen z odkazu
  const fake = wizard(memStorage(), tripHash({ ...sent, sharedOn: '2026-10-01', shared: { on: '<script>' } }));
  assert.equal(await fake.Trip.importFromHash(), true);
  assert.deepEqual(plain(fake.c.S.trip.shared), { on: '2026-10-01' });
  // vlastní odkaz otevřený u sebe (i s jiným dnem sdílení): tatáž cesta, bez otázky a bez poznámky
  const st = memStorage(), own = wizard(st, tripHash({ ...sent, sharedOn: '2026-10-01' }));
  own.c.S.trip = plain(t);
  own.c.confirm = () => assert.fail('bez otázky');
  assert.equal(await own.Trip.importFromHash(), true);
  assert.equal(own.c.S.trip.shared, undefined);
  // novější verze ještě neuložené sdílené cesty (program navíc): zůstane sdílená, s dnem z nového odkazu
  const again = wizard(memStorage(), tripHash({ ...sent, sharedOn: '2026-10-05', plan: { center: { lat: 35.68, lon: 139.76 }, days: [{ date: '2027-03-13', cap: 360, items: [{ id: 'q1', name: 'Sensódži', lat: 35.71, lon: 139.79, category: 'sight', visitMin: 60 }] }] } }));
  again.c.S.trip = { ...plain(b.c.S.trip), shared: { on: today }, created: 9 };
  assert.equal(await again.Trip.importFromHash(), true);
  assert.deepEqual([plain(again.c.S.trip.shared), again.c.S.trip.created], [{ on: '2026-10-05' }, 9]);
});

test('vlak/bus místo letu jindy (a zpět k letu): odškrtnutí „Co zařídit a co sbalit“ zůstanou u cesty', () => {
  const w = wizard(memStorage());
  const place = (label, lat, lon) => ({ label, cc: label === 'Praha' ? 'CZ' : 'AT', lat, lon, tz: 'Europe/Prague' });
  const g = (date) => ({ source: 'regiojet', id: 'rj1', date, dep: `${date}T06:01`, arr: `${date}T09:55`, min: 234, czk: 299, kinds: ['TRAIN'], transfers: 0 });
  const t = trip({ cc: 'AT', label: 'Vídeň', out: '2027-07-10', back: '2027-07-17', step: 'flight', verifiedAt: 1,
    overland: { on: true, q: null, km: 254, est: null, from: place('Praha', 50.08, 14.43), to: place('Vídeň', 48.19, 16.38), out: g('2027-07-11'), back: g('2027-07-18'), links: { out: [], back: [] } } });
  w.c.S.trip = t;
  const k0 = w.P.tripKey(t);
  assert.match(k0, /:2027-07-11:AT$/);
  for (const id of ['todo:ins', 'pack:doc-pass']) w.P.setDone(k0, id, true);
  w.Trip.render();
  w.els['#ovFly'].onclick();
  const k1 = w.P.tripKey(t);
  assert.match(k1, /:2027-07-10:AT$/);
  assert.deepEqual(Object.keys(plain(w.P.doneOf(k1))).sort(), ['pack:doc-pass', 'todo:ins']);
  // zpět pod původní klíč platí stav cesty (odškrtnutí zrušené mezitím se nevrátí)
  w.P.setDone(k1, 'todo:ins', false);
  w.P.setDone(k1, 'pack:cl-hat', true);
  w.P.copyDone(k1, k0);
  assert.deepEqual(Object.keys(plain(w.P.doneOf(k0))).sort(), ['pack:cl-hat', 'pack:doc-pass']);
  // bez odškrtnutí nic neukládá
  w.P.copyDone('nic:1', 'nic:2');
  assert.equal(JSON.parse(w.c.localStorage.getItem('atlas_pretrip_v1'))['nic:2'], undefined);
});

test('plánovač ↔ průvodce po změně data v průvodci (bez nového uložení): odškrtnutí se propisují dál, dvě cesty do stejného místa zůstanou zvlášť', () => {
  const w = wizard(memStorage());
  const P2 = w.P, o = { isos: ['AT'], climate: [] };
  const place = (label, lat, lon) => ({ label, cc: label === 'Praha' ? 'CZ' : 'AT', lat, lon, tz: 'Europe/Prague' });
  const g = (date) => ({ source: 'regiojet', id: 'rj1', date, dep: `${date}T06:01`, arr: `${date}T09:55`, min: 234, czk: 299, kinds: ['TRAIN'], transfers: 0 });
  const ov = { on: true, q: null, km: 254, est: null, from: place('Praha', 50.08, 14.43), to: place('Vídeň', 48.19, 16.38), out: g('2027-07-11'), back: g('2027-07-18'), links: { out: [], back: [] } };
  // cesta vlakem uložená v plánovači (klíč kopie k0), pak v průvodci „✈️ Radši letět“ o den dřív – zatím neuložená
  const t = trip({ cc: 'AT', label: 'Vídeň', out: '2027-07-10', back: '2027-07-17', step: 'flight', verifiedAt: 1, overland: ov });
  w.c.S.trip = t;
  const k0 = P2.tripKey(t);
  P2.setDone(k0, 'todo:ins', true);
  const saved = { name: 'Vídeň 11.7.', dest: 'Vídeň', iso: 'AT', start: '2027-07-11', tripId: t.created, wizard: plain(t), checklist: plain(P2.plannerChecklist(t, o)) };
  // druhá uložená cesta do Vídně (jiný vznik, stejné datum jako průvodce teď): nesmí se s první plést
  const t2 = trip({ cc: 'AT', label: 'Vídeň', out: '2027-07-10', back: '2027-07-17', created: 1767225600999 }), k2 = P2.tripKey(t2);
  const other = { name: 'Vídeň s Janou', dest: 'Vídeň', iso: 'AT', start: '2027-07-10', tripId: t2.created, wizard: plain(t2), checklist: plain(P2.plannerChecklist(t2, o)) };
  w.c.S.trips = [other, saved];
  assert.equal(P2.savedKey(saved), k0);
  w.Trip.render();
  w.els['#ovFly'].onclick();
  const k1 = P2.tripKey(t);
  assert.notEqual(k1, k0);
  assert.equal(P2.savedKey(saved), k0, 'kopie v plánovači má pořád staré datum');
  const ck = (p, id) => p.checklist.find((x) => x.id === id);
  // plánovač → průvodce (app.js toggleCheck): karta průvodce s novým datem to ukáže
  const pass = ck(saved, 'pack:doc-op');
  pass.done = true; P2.fromPlanner(saved, pass);
  assert.equal(P2.doneOf(k1)['pack:doc-op'], 1, 'pod klíčem průvodce');
  assert.equal(P2.doneOf(k0)['pack:doc-op'], 1, 'i pod klíčem uložené kopie');
  assert.match(P2.html(t, o), /data-ptk="pack:doc-op" checked/);
  // průvodce → plánovač (zaškrtávátko karty: setDone + toPlanner)
  const tick = (id, on) => { P2.setDone(k1, id, on); return P2.toPlanner(w.c.S.trips, k1, id, on); };
  assert.equal(tick('pack:cl-shoes', true), 1);
  assert.equal(ck(saved, 'pack:cl-shoes').done, true);
  assert.equal(P2.doneOf(k0)['pack:cl-shoes'], 1);
  // zrušené odškrtnutí: v plánovači i pod klíčem kopie – otevření uložené verze (openSaved) ho nevrátí
  assert.equal(tick('todo:ins', false), 1);
  assert.equal(ck(saved, 'todo:ins').done, false);
  assert.equal(P2.doneOf(k0)['todo:ins'], undefined);
  // druhá cesta do Vídně se nezměnila (ani její odškrtnutí)
  assert.ok(other.checklist.every((x) => !x.done), 'jiná uložená cesta beze změny');
  assert.deepEqual(plain(P2.doneOf(k2)), {});
  // odškrtnutí ve druhé cestě v plánovači jde jen k ní, ne do průvodce s první cestou
  const ins2 = ck(other, 'todo:ins');
  ins2.done = true; P2.fromPlanner(other, ins2);
  assert.equal(P2.doneOf(k2)['todo:ins'], 1);
  assert.equal(P2.doneOf(k1)['todo:ins'], undefined);
  assert.doesNotMatch(P2.html(t, o), /data-ptk="todo:ins" checked/);
  assert.equal(ck(saved, 'todo:ins').done, false);
  // karta průvodce nic nepřehodí (vše už sedí); po otevření uložené verze platí totéž
  let saves = 0;
  w.c.save = () => { saves++; };
  P2.html(t, o);
  assert.equal(saves, 0);
  w.c.S.trip = { ...plain(saved.wizard), created: saved.tripId };
  assert.equal(P2.tripKey(w.c.S.trip), k0);
  const h0 = P2.html(w.c.S.trip, o);
  assert.match(h0, /data-ptk="pack:doc-op" checked/);
  assert.match(h0, /data-ptk="pack:cl-shoes" checked/);
  assert.doesNotMatch(h0, /data-ptk="todo:ins" checked/);
  assert.equal(ck(saved, 'todo:ins').done, false, 'zrušené odškrtnutí se nevrátilo');
  // klíč bez vzniku cesty (0) se spojí jen přesně
  assert.equal(P2.toPlanner([{ tripId: 0, wizard: { ...plain(t), created: 0 }, checklist: [{ t: 'x', id: 'todo:ins', done: false }] }], P2.tripKey({ ...t, created: 0, overland: { ...ov, on: true } }), 'todo:ins', true), 0);
});

test('vlastní položky: přidat, pročistit, nejvýš 30, smazat i s odškrtnutím; uložené s cestou, v kartě escapované, v tisku i v plánovači', () => {
  const c = load({ storage: memStorage() });
  let saves = 0;
  c.save = () => { saves++; };
  const P2 = c.window.PreTrip;
  const t = trip({ cc: 'JP', label: 'Tokio' });
  const key = P2.tripKey(t);
  // bez HTML, řídicích znaků a obracení textu, mezery sloučené, apostrof typografický (obyčejný by sdílený odkaz vypustil)
  assert.equal(P2.addCustom(t, "  Nabíječka\tna <b>hodinky</b>\n \"Garmin\" & dětské 'žabky' \u202e "), '');
  assert.deepEqual(plain(t.pretrip.custom), [{ id: 'my-1', text: 'Nabíječka na bhodinky/b Garmin & dětské ’žabky’' }]);
  assert.equal(saves, 1, 'uloží se s cestou (save z app.js)');
  assert.equal(P2.addCustom(t, 'NABÍJEČKA na bhodinky/b garmin & dětské ’žabky’'), 'Tahle položka už v seznamu je.');
  assert.equal(P2.addCustom(t, ' <> '), 'Napiš, co chceš přidat.');
  // nejvýš 80 znaků (bez rozpůleného emoji)
  assert.equal(P2.addCustom(t, 'a' + '🧦'.repeat(60)), '');
  assert.equal(t.pretrip.custom[1].text, 'a' + '🧦'.repeat(39));
  // nejvýš 30 položek
  for (let i = 0; t.pretrip.custom.length < 30; i++) assert.equal(P2.addCustom(t, `věc ${i}`), '');
  assert.equal(P2.addCustom(t, 'třicátá první'), 'Vlastních položek může být nejvýš 30.');
  assert.equal(t.pretrip.custom.length, 30);
  // smazání i s odškrtnutím; uvolněné číslo se použije znovu, ale bez starého odškrtnutí
  P2.setDone(key, 'pack:my-2', true);
  assert.equal(P2.delCustom(t, 'my-2'), true);
  assert.equal(P2.delCustom(t, 'my-2'), false);
  assert.equal(P2.doneOf(key)['pack:my-2'], undefined);
  assert.equal(P2.addCustom(t, 'Ponožky navíc'), '');
  assert.deepEqual(plain(t.pretrip.custom.at(-1)), { id: 'my-2', text: 'Ponožky navíc' });
  // uložená cesta (JSON v localStorage) po obnovení stránky stejná; aktivity a vlastní položky se navzájem nepřepíšou
  assert.deepEqual(plain(P2.customOf(JSON.parse(JSON.stringify(t)))), plain(t.pretrip.custom));
  // karta: skupina „Vlastní položky“ se ✕, pole pro přidání; text vždy escapovaný (i z poškozené uložené cesty)
  P2.setDone(key, 'pack:my-1', true);
  t.pretrip.custom[0] = { id: 'my-1', text: '<img src=x onerror=alert(1)> & "x"' };
  const h = sp(P2.html(t, { isos: ['JP'], climate: [] }));
  assert.match(h, /<h5>✏️ Vlastní položky<\/h5>/);
  assert.match(h, /<li class="pt-own done"><label class="pt-row"><input type="checkbox" data-ptk="pack:my-1" checked><span>img src=x onerror=alert\(1\) &amp; x<\/span><\/label><button type="button" class="pt-del" data-pt-del="my-1" title="Smazat položku" aria-label="Smazat položku img src=x onerror=alert\(1\) &amp; x">✕<\/button><\/li>/);
  assert.match(h, /<\/div><form class="pt-add" data-pt-add><input class="input" maxlength="80" placeholder="Přidat vlastní položku…" aria-label="Přidat vlastní položku do seznamu věcí"[^>]*><button type="submit" class="btn sm">\+ Přidat<\/button><\/form><\/section>/);
  assert.ok(!/<img|<b>hodinky/.test(h));
  const boxes = (h.match(/data-ptk="pack:my-/g) || []).length;
  assert.equal(boxes, 30, 'všechny vlastní položky se zaškrtávátkem');
  // tisk: vlastní položky jsou v seznamu (tiskne se celý), skryté jsou jen ovládací prvky
  const css = read('public/css/pretrip.css'), print = css.slice(css.indexOf('@media print'));
  assert.match(print, /\.pt-add,\.pt-del\{display:none !important\}/);
  assert.doesNotMatch(print, /pt-own|pt-groups\{display:none/);
  // plánovač („💾 Uložit do plánovače“) i sdílený odkaz je nesou
  const list = plain(P2.plannerChecklist(t, { isos: ['JP'], climate: [] }));
  assert.ok(list.some((x) => x.t === 'img src=x onerror=alert(1) & x' && x.done), JSON.stringify(list.slice(-3)));
  assert.ok(list.some((x) => x.t === 'Ponožky navíc' && !x.done));
  const shared = plain(P2.shareState(t));
  assert.equal(shared.custom.length, 30);
  assert.deepEqual(shared.done, ['pack:my-1']);
  // aktivity se přidáním položky nepřepíšou (a naopak)
  t.pretrip.acts = ['beach'];
  P2.addCustom(t, 'Šnorchl');
  assert.deepEqual(plain(t.pretrip.acts), ['beach']);
});

test('sdílený odkaz na cestu do jednoho místa: program bez popisů, fotek a „dalších míst“, souřadnice na 5 míst, let jen s tím, co čte průvodce', async () => {
  const poi = (i) => ({ id: `Q${i}`, name: `Místo ${i}`, lat: 41.38 + i / 1e3 + 1.234567e-7, lon: 2.17 + i / 1e3, category: 'museum', visitMin: 60, fromPrevKm: 0.4, fromPrevMin: 5, transit: false,
    description: 'muzeum', extract: 'x'.repeat(400), image: 'https://upload.wikimedia.org/' + 'y'.repeat(150), url: 'https://cs.wikipedia.org/wiki/M', sitelinks: 40, score: 12.5 });
  const plan = { days: [{ date: '2027-07-11', items: [poi(1), poi(2)], walkKm: 0.8, minutes: 120 }, { date: '2027-07-12', items: [{ ...poi(3), transit: true }], walkKm: 0, minutes: 60 }],
    spare: Array.from({ length: 30 }, (_, i) => poi(10 + i)), center: { lat: 41.3851234567, lon: 2.1734123456 }, span: { start: '2027-07-11', days: 2 }, created: 1 };
  // stará trasa po „Víc míst“ → „Jedno místo celý pobyt“ (mode 'single') do odkazu nepatří
  const base = (name, lat) => ({ name, lat, lon: 2.1, nights: 2, plan: { days: [{ items: [poi(50), poi(51)] }], spare: [poi(60)], center: { lat, lon: 2.1 } }, searchUrl: 'https://www.booking.com/searchresults.cs.html?ss=' + name });
  const route = { mode: 'single', bases: [base('Barcelona', 41.38), base('Girona', 41.98), base('Sitges', 41.23)], transfers: [{ mode: 'car' }, { mode: 'car' }] };
  const t = trip({ plan, route, cityCenter: { lat: 41.3851234567, lon: 2.1734123456, name: 'Barcelona' }, stay: { mode: 'pick', name: 'Hotel', lat: 41.390000123, lon: 2.16000099, url: 'https://www.booking.com/x' } });
  Object.assign(t.flight, { id: 'abc', perPersonCzk: 6000, totalCzk: 12000, deal: { level: 'super', pct: 40, ref: 9000 } });
  Object.assign(t.flight.out, { live: false, foundAt: 1, otherDeps: [{ dep: 'x' }], czk: 2500, price: 99, currency: 'EUR' });
  Object.assign(t.flight.back, { live: true, arrEst: false });
  const a = wizard(memStorage());
  a.c.S.trip = t;
  a.Trip.render();
  await a.els['#sumShare'].onclick();
  const url = a.c.copied[0], sent = sentOf(url);
  assert.equal(sent.plan.spare, undefined, 'bez dalších míst');
  assert.equal(sent.plan.created, undefined);
  assert.deepEqual(Object.keys(sent.plan.days[0].items[0]).sort(), ['category', 'fromPrevKm', 'fromPrevMin', 'id', 'lat', 'lon', 'name', 'visitMin']);
  assert.equal(sent.plan.days[1].items[0].transit, true);
  assert.equal(sent.plan.days[0].items[0].lat, 41.381);
  assert.deepEqual(sent.plan.center, { lat: 41.38512, lon: 2.17341 });
  assert.deepEqual([sent.cityCenter.lat, sent.stay.lat, sent.stay.lon], [41.38512, 41.39, 2.16]);
  assert.deepEqual(sent.flight.deal, { level: 'super' }, '🔥 Super cena zůstane');
  for (const k of ['id', 'perPersonCzk', 'totalCzk']) assert.equal(sent.flight[k], undefined, k);
  assert.equal(sent.flight.out.live, false, 'cena z mezipaměti se pozná i u příjemce');
  for (const k of ['foundAt', 'otherDeps', 'czk', 'price', 'currency']) assert.equal(sent.flight.out[k], undefined, k);
  assert.equal(sent.flight.back.live, true, 'živá cena zůstane živá (Je to dobrá cena?)');
  assert.equal('arrEst' in sent.flight.back, false);
  assert.equal(sent.route, undefined, 'bez trasy (cesta do jednoho místa)');
  assert.equal(sent.flight.flightCzk, 5000);
  assert.ok(url.length < 2500, `krátký odkaz: ${url.length}`);
  assert.equal(t.plan.spare.length, 30, 'odesílateli se cesta nemění');
  // příjemce otevře stejný program
  const b = wizard(memStorage(), url.slice(url.indexOf('#')));
  assert.equal(await b.Trip.importFromHash(), true);
  const got = b.c.S.trip;
  assert.deepEqual(plain(got.plan.days.map((d) => d.items.map((x) => x.name))), [['Místo 1', 'Místo 2'], ['Místo 3']]);
  assert.equal(got.flight.deal.level, 'super');
  assert.ok(!got.route || got.route.mode !== 'multi', 'příjemce má cestu do jednoho místa');
});

test('💾 záloha: odškrtnutí ze zálohy se sloučí – jen známá id, novější čas (nejvýš teď), vlastní cesty nikdy nevypadnou', () => {
  const st = memStorage();
  const P2 = load({ storage: st }).window.PreTrip;
  P2.setDone('a', 'pack:doc-pass', true);
  const at0 = JSON.parse(st.mem.get('atlas_pretrip_v1')).a.at;
  const inc = JSON.parse(`{"__proto__":{"d":{"pack:doc-x":1}},"a":{"d":{"pack:tc-adapter-AB":1,"<b>":1,"pack:my-3":1},"at":${at0 - 1000}},"b c":{"d":{"todo:ins":1}},"b":{"d":{"todo:ins":1,"nic":1},"at":3},"prazdne":{"d":{"x":1}}}`);
  assert.equal(P2.mergeDone(inc), 2);
  assert.deepEqual(plain(P2.doneOf('a')), { 'pack:doc-pass': 1, 'pack:tc-adapter-AB': 1, 'pack:my-3': 1 });
  assert.deepEqual(plain(P2.doneOf('b')), { 'todo:ins': 1 });
  const s = JSON.parse(st.mem.get('atlas_pretrip_v1'));
  assert.equal(s.a.at, at0, 'starší čas ze zálohy čas cesty nezmění');
  assert.deepEqual(Object.keys(s).sort(), ['a', 'b']);
  assert.equal({}.d, undefined);
  assert.deepEqual(plain(P2.exportDone()), s);
  assert.equal(P2.mergeDone(inc), 0, 'podruhé nic nového');
  // čas z budoucnosti se omezí na teď
  P2.mergeDone({ c: { d: { 'pack:doc-pass': 1 }, at: 9e15 } }, 1000);
  assert.equal(JSON.parse(st.mem.get('atlas_pretrip_v1')).c.at, 1000);
  // 30 cizích cest s časem z budoucnosti nevytlačí vlastní – vejdou se jen do volných míst
  const many = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`99${i}:2027-01-01:XX`, { d: { 'pack:doc-pass': 1 }, at: 9e15 }]));
  P2.mergeDone(many);
  const s2 = JSON.parse(st.mem.get('atlas_pretrip_v1'));
  assert.equal(Object.keys(s2).length, 30);
  assert.ok(['a', 'b', 'c'].every((k) => s2[k]), 'vlastní odškrtnutí zůstala');
  assert.equal(P2.mergeDone(null), 0);
  assert.equal(P2.mergeDone([1]), 0);
});

test('💾 záloha: cesta z průvodce projde zálohou (pravý Trip.sanitizeTrip) a jde znovu otevřít v průvodci', () => {
  const { c, Trip } = wizard(memStorage());
  vm.runInContext(read('public/js/planshare.js'), c, { filename: 'planshare.js' });
  vm.runInContext(read('public/js/backup.js'), c, { filename: 'backup.js' });
  const B = c.window.Backup;
  const deps = { sanitizePlan: c.window.PlanShare.sanitize, sanitizeWizard: Trip.sanitizeTrip, txt: c.window.PlanShare.txt };
  const t = tokyo();
  const entry = { name: 'Tokio 12. 3.', dest: 'Tokio', iso: 'JP', start: '2027-03-12', end: '2027-03-21', pax: '2', budget: '40000', flight: 'PRG→NRT', days: {}, checklist: [], notes: '', tripId: t.created, wizard: { ...JSON.parse(JSON.stringify(t)), booked: { 'flight': true, 'stay:geo:35.68,139.76': true } } };
  const inc = B.parse(B.pack({ trips: [entry] }), deps);
  const w = inc.trips[0].wizard;
  assert.equal(w.flight.out.to, 'NRT');
  assert.equal(w.dest.label, 'Tokio');
  assert.deepEqual(plain(w.booked), { flight: true, 'stay:geo:35.68,139.76': true });
  // záloha stejného zařízení: cesta z průvodce je „už máš“, ne „změněná“ (obě strany po stejném pročištění)
  const df = B.diff({ trips: [entry] }, inc, { deps });
  assert.deepEqual(plain(df.trips), { add: 0, same: 1, changed: 0 });
  assert.deepEqual(plain(B.diff({ trips: [entry] }, B.parse(B.pack({ trips: inc.trips }), deps), { deps }).trips), { add: 0, same: 1, changed: 0 });
  assert.equal(Trip.openSaved(w, inc.trips[0].tripId), true);
  assert.equal(c.S.trip.dest.label, 'Tokio');
  assert.equal(c.S.trip.created, t.created);
  assert.equal(c.S.trip.booked.flight, true);
});

/* ---------- opravy z procházky (městská cesta, jednodenní, přes Nový rok, proběhlá) ---------- */
test('hlavní město (Vídeň, Oslo): bez výchozí turistiky a sněhu podle štítků země; Innsbruck v lednu sníh, ne turistika', () => {
  const acts = (cc, label, lat, lon, cl) => [...ctxOf(trip({ cc, dest: { label, cc, lat, lon } }), { climate: [cl] }).acts];
  assert.deepEqual(acts('AT', 'Vídeň', 48.21, 16.37, flat(25, 15, 80)), ['city']);
  assert.deepEqual(acts('NO', 'Oslo', 59.91, 10.75, flat(16, 6, 60)), ['city']);
  assert.deepEqual(acts('AT', 'Vídeň', 48.21, 16.37, flat(3, -2, 40)), ['city'], 'Vídeň v lednu: město, ne lyžařské brýle');
  assert.deepEqual(acts('AT', 'Innsbruck', 47.26, 11.39, flat(4, -4, 50)), ['city', 'snow'], 'u letiště 4 °C, na horách sníh');
  assert.deepEqual(acts('AT', 'Innsbruck', 47.26, 11.39, flat(22, 10, 120)), ['hike', 'city'], 'v létě dál hory');
  const vie = ctxOf(trip({ cc: 'AT', dest: { label: 'Vídeň', cc: 'AT', lat: 48.21, lon: 16.37 } }), { climate: [flat(25, 15, 80)] });
  assert.ok(!byId(P.todos(vie), 'ins').lines.join(' ').includes('turistiku na horách'));
  // zvolená turistika platí i ve městě
  assert.ok(ctxOf(trip({ cc: 'AT', dest: { label: 'Vídeň', cc: 'AT', lat: 48.21, lon: 16.37 }, pretrip: { acts: ['hike'] } })).acts.has('hike'));
});

test('výlet na jeden den: jedno datum, bez oblečení na spaní a potvrzení rezervací; přes Nový rok rok i u začátku', () => {
  const day = trip({ out: '2027-07-10', back: '2027-07-10', stay: { mode: 'skip' } });
  const h = sp(P.html(day, { isos: ['ES'], climate: [] }));
  assert.match(h, /<div class="muted pt-sub">Španělsko · 10\. 7\. 2027 · 1 den ·/);
  const ids = itemIds(day);
  assert.ok(!ids.includes('cl-sleep') && !ids.includes('doc-stay'), ids.join(','));
  // s autem jen potvrzení auta; s nocí a ubytováním obojí
  assert.equal(items(trip({ out: '2027-07-10', back: '2027-07-10', stay: { mode: 'skip' }, car: CAR })).find((x) => x.id === 'doc-stay').text, 'Potvrzení rezervace auta');
  assert.equal(items(trip({ car: CAR })).find((x) => x.id === 'doc-stay').text, 'Potvrzení rezervací (ubytování, auto)');
  assert.equal(items(trip()).find((x) => x.id === 'doc-stay').text, 'Potvrzení rezervace ubytování');
  assert.ok(itemIds(trip()).includes('cl-sleep'));
  const ny = sp(P.html(trip({ out: '2026-12-28', back: '2027-01-08' }), { isos: ['ES'], climate: [] }));
  assert.match(ny, /pt-sub">Španělsko · 28\. 12\. 2026 – 8\. 1\. 2027 · 12 dní/);
});

test('mimo EU: autosedačka bez „v EU povinná“, pojištění bez „I v EU“ (Británie)', () => {
  const us = items(trip({ cc: 'US', label: 'New York', car: CAR, children: 1 }));
  assert.match(us.find((x) => x.id === 'kd-seat').note, /^pravidla a výška dítěte se liší podle země/);
  const gb = byId(todo(trip({ cc: 'GB', label: 'Londýn' })), 'ins').lines.map(strip).join(' ');
  assert.doesNotMatch(gb, /I v EU/);
});

test('souhrn „🎒 Seznam věcí … · sbaleno N“ se přepočítá při odškrtnutí; proběhlá cesta kartu „Co zařídit“ nemá', () => {
  const src = read('public/js/pretrip.js');
  const prog = src.slice(src.indexOf('function progress(root)'), src.indexOf('function printList()'));
  assert.match(prog, /details\.pt-packd > summary/);
  assert.match(prog, /packTxt\(pk\.length, pk\.filter\(b => b\.checked\)\.length\)/);
  // proběhlá i probíhající (od dne po odletu) cesta kartu nemá; po cestě ani vstupní podmínky
  const tj = read('public/js/trip.js');
  assert.match(tj, /const past = Boolean\(pastHtml\(t\)\), onTrip = !past && !t\.shared && outLeg\(t\)\.date < fmtYMD\(new Date\(\)\);/);
  assert.match(tj, /\$\{window\.PreTrip && !past && !onTrip \? PreTrip\.html\(/);
  assert.match(tj, /\$\{past \? '' : window\.Entry && Entry\.ready\(\) \? Entry\.checklistHtml\(/);
  assert.match(tj, /\$\{onTrip \|\| past \? '<details class="sum-booked"><summary><b>✅ Co zarezervovat<\/b>/, 'sbalené na cestě i po ní');
});
