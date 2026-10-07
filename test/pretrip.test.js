// „Před cestou“: co zařídit (pojištění, EHIC, DROZD, řidičský průkaz, zásuvky) a chytrý seznam věcí na cestu –
// kontrola dat (public/data/pretrip.json) a pravidel z public/js/pretrip.js. Klasické skripty prohlížeče přes node:vm
// s pravými vstupními podmínkami (data/entry.json) a daty zemí; podnebí dodávají testy rovnou (bez sítě).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const PT = JSON.parse(read('public/data/pretrip.json'));
const ENTRY = JSON.parse(read('data/entry.json'));
const COUNTRIES = JSON.parse(read('data/countries.json'));
const CLIMATE = JSON.parse(read('data/climate.json'));
const ISO = new Set(COUNTRIES.map((c) => c.iso2));
const EU = 'AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE'.split(' ');

/** Kontext jako v prohlížeči: helpery z app.js, země, vstupní podmínky, pretrip.js; volitelně trip.js a úložiště. */
function load({ withTrip = false, storage = null, data = PT } = {}) {
  const ctx = { window: {}, URLSearchParams, TextEncoder, TextDecoder, btoa, atob, console, URL, Intl, setTimeout, clearTimeout };
  if (storage) ctx.localStorage = storage;
  vm.createContext(ctx);
  vm.runInContext(read('public/js/ics.js'), ctx, { filename: 'ics.js' });
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
  assert.ok(es.includes('I v EU se vyplatí: EHIC nekryje spoluúčast, převoz do ČR ani asistenční službu.'));
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
  assert.equal(items(cold, { climate: [at('TOS', 'Tromsø')] }).find((x) => x.id === 'cl-warm').note, 'ráno kolem −5 °C');
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
  assert.deepEqual(list[0], { t: 'Zařídit: cestovní pojištění', done: true });
  assert.ok(list.some((x) => x.t === 'Zařídit: mezinárodní řidičský průkaz (vzor 1949)' && !x.done));
  assert.ok(list.some((x) => x.t === 'Cestovní pas (občanský průkaz nestačí)' && x.done));
  assert.ok(list.every((x) => x.t.length <= 120 && !/["<>`]/.test(x.t)));
  assert.ok(!list.some((x) => /^Zařídit: peníze/.test(x.t)), 'informace bez úkolu ne');
  // prochází pročištěním sdíleného plánu beze změny (#plan=)
  const ps = { window: {}, TextEncoder, TextDecoder, btoa, atob };
  vm.createContext(ps);
  vm.runInContext(read('public/js/planshare.js'), ps);
  const back = plain(ps.window.PlanShare.decode(ps.window.PlanShare.encode({ name: 'Tokio', start: '2027-07-10', end: '2027-07-17', checklist: list })).checklist);
  assert.deepEqual(back.map((x) => x.t), list.map((x) => x.t));
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
  const t = { ...trip({ cc: 'JP', label: 'Tokio', out: '2027-03-12', back: '2027-03-21', car: { mode: 'manual', totalCzk: 9000, pickup: 'NRT', dropoff: 'NRT', from: '2027-03-13T10:00', to: '2027-03-21T08:00' } }), dest: { label: 'Tokio', country: 'Japonsko', cc: 'JP', lat: 35.7, lon: 139.7 } };
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

test('sdílený odkaz na cestu (#trip=): odškrtnutí a vlastní položky tam a zpět, odškrtnutí jiných cest příjemce zůstanou, starší odkazy', () => {
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
  a.els['#sumShare'].onclick();
  const url = a.c.copied[0];
  assert.match(url, /^https:\/\/atlas\.example\/#trip=[A-Za-z0-9_-]+$/);
  const sent = JSON.parse(Buffer.from(url.split('#trip=')[1], 'base64url').toString('utf8'));
  const custom = [{ id: 'my-1', text: 'Nabíječka na hodinky' }, { id: 'my-2', text: 'Dárek pro Keiko' }];
  assert.deepEqual(sent.pretrip, { acts: ['hike', 'city'], custom, done: ['todo:ins', 'pack:doc-pass', 'pack:my-2'] });
  assert.equal(sent.created, undefined);
  assert.equal(t.pretrip.done, undefined, 'odesílateli se cesta nemění');
  // příjemce: jiný prohlížeč s odškrtnutím jiné cesty
  const st = memStorage();
  st.setItem('atlas_pretrip_v1', JSON.stringify({ 'jina:cesta': { d: { 'pack:cl-hat': 1 }, at: 1 } }));
  const b = wizard(st, url.slice(url.indexOf('#')));
  assert.equal(b.Trip.importFromHash(), true);
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
  assert.equal(old.Trip.importFromHash(), true);
  assert.equal(old.c.S.trip.pretrip, undefined);
  assert.deepEqual(plain(old.P.doneOf(old.P.tripKey(old.c.S.trip))), {});
  const acts = wizard(memStorage(), tripHash({ ...sent, pretrip: { acts: ['beach'] } }));
  assert.equal(acts.Trip.importFromHash(), true);
  assert.deepEqual(plain(acts.c.S.trip.pretrip), { acts: ['beach'] });
  // nic k sdílení → odkaz bez pole
  const n = wizard(memStorage());
  n.c.S.trip = tokyo();
  n.Trip.render();
  n.els['#sumShare'].onclick();
  assert.equal(JSON.parse(Buffer.from(n.c.copied[0].split('#trip=')[1], 'base64url').toString('utf8')).pretrip, undefined);
});

test('sdílený odkaz na cestu: podvržený stav karty – jen známé aktivity, pročištěné vlastní položky, id odškrtnutí ve známém tvaru, omezené počty', () => {
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
  assert.equal(imp.Trip.importFromHash(), true);
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
