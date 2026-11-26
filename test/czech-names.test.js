// Místa tak, jak je Češi píšou: české exonymy (Benátky, Solnohrad, Cařihrad), oblasti a ostrovy, bez diakritiky, malými,
// s překlepem a ve tvaru z věty („do Benátek“, „v Aténách“, „z Lince“). Pole Kam/Odkud (server/lib/places.js + výběr místa
// z věty jako ve flights.js resolvePlace) a hledání v Objevuj (geocodeExplore, smartPlace v public/js/places.js).
// Bez sítě: geokódování je z vlastního seznamu míst (data/places.json z GeoNames) – v DEMO stejně jako v provozu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { config } from '../server/config.js';

const { suggest, localSuggestions, geocodeExplore } = await import('../server/lib/places.js');
const src = (f) => readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');
const plain = (x) => JSON.parse(JSON.stringify(x));
const short = (s) => (s ? `${s.id.split('|')[0]}${s.id.includes('|') ? `|${s.id.split('|')[1]}` : ''}${s.fuzzy ? ' (překlep)' : ''}` : '—');

// /api/places a /api/geocode přímo nad serverovým kódem (fetch v prohlížeči → funkce serveru); geoAsked = texty pro geokodér
const geoAsked = [];
async function api(url) {
  const u = new URL(url, 'http://atlas/');
  const q = (u.searchParams.get('q') || '').slice(0, 80);
  if (u.pathname === '/api/places') return { items: await suggest(q, { remote: u.searchParams.get('remote') !== '0', role: u.searchParams.get('role') === 'from' ? 'from' : 'to' }) };
  if (u.pathname === '/api/geocode') {
    geoAsked.push(q);
    return { items: await geocodeExplore(q, { mapy: false, regions: u.searchParams.get('mapy') === '1' }) };
  }
  throw new Error(`neznámý dotaz ${url}`);
}
const ctx = { console, URLSearchParams, fetch: async (url) => { const body = plain(await api(url)); return { ok: true, status: 200, json: async () => body }; } };
ctx.window = ctx; // places.js volá Smart bez window.
vm.createContext(ctx);
vm.runInContext(src('app.js').match(/^const (esc|enc|flag|safeUrl|cssUrl|pad|fmtYMD) = .*$/gm).join('\n'), ctx);
for (const f of ['searchhelp.js', 'smart.js', 'places.js']) vm.runInContext(src(f), ctx, { filename: f });
const { Smart, SearchHelp: H } = ctx;
const T = ctx.Places._t;
const today = '2026-10-22';
const presets = { weekend: { nMin: 1, nMax: 3, out: [4, 5, 6], back: [0, 1] }, long: { nMin: 3, nMax: 5, out: [3, 4, 5], back: [0, 1, 2] }, week: { nMin: 5, nMax: 9, out: [], back: [] }, '2weeks': { nMin: 11, nMax: 16, out: [], back: [] } };

/** Místo z věty v poli Kam/Odkud jako flights.js resolvePlace: tvary ze Smart.stems, napřed vlastní data (remote=0). */
function fromSentence(text) {
  const sm = Smart.parse(text, { today, presets, holidays: H.holidayList(today), holidayDates: H.holidayDates });
  const [phrase, role] = sm.to.length ? [sm.to[0], 'to'] : [sm.from[0], 'from'];
  assert.ok(phrase, `ve větě „${text}“ žádné místo`);
  return Smart.bestPlace(Smart.stems(phrase).map((q) => ({ q, items: plain(localSuggestions(q, 8, { role })), local: true })));
}

// [napsáno, první návrh v poli Kam (ID), překlep smí být opravou (fuzzy)]
const VCE = /^(metro|ap):VCE$/, ROM = /^(metro:ROM|ap:FCO)$/;
const KAM = [
  ['Benátky', VCE], ['Mnichov', /^ap:MUC$/], ['Vídeň', /^ap:VIE$/], ['Řím', ROM], ['Londýn', /^metro:LON$/], ['Paříž', /^metro:PAR$/],
  ['Drážďany', /^ap:DRS$/], ['Norimberk', /^ap:NUE$/], ['Lipsko', /^ap:LEJ$/], ['Solnohrad', /^ap:SZG$/], ['Salcburk', /^ap:SZG$/],
  ['Inšpruk', /^ap:INN$/], ['Štýrský Hradec', /^ap:GRZ$/], ['Lublaň', /^ap:LJU$/], ['Záhřeb', /^ap:ZAG$/], ['Bělehrad', /^ap:BEG$/],
  ['Varšava', /^metro:WAW$/], ['Krakov', /^ap:KRK$/], ['Vratislav', /^ap:WRO$/], ['Katovice', /^ap:KTW$/], ['Miláno', /^metro:MIL$/],
  ['Neapol', /^ap:NAP$/], ['Florencie', /^ap:FLR$/], ['Janov', /^ap:GOA$/], ['Kodaň', /^ap:CPH$/], ['Stockholm', /^metro:STO$/],
  ['Lisabon', /^ap:LIS$/], ['Atény', /^ap:ATH$/], ['Soluň', /^ap:SKG$/], ['Kréta', /^rg:kreta$/], ['Heraklion', /^ap:HER$/],
  ['Mallorka', /^rg:mallorca$/], ['Majorka', /^rg:mallorca$/], ['Minorka', /^ap:MAH$/], ['Tenerife', /^ap:TF[SN]$/], ['Kanáry', /^rg:kanary$/],
  ['Malta', /^cc:MT$/], ['Istanbul', /^metro:IST$/], ['Cařihrad', /^metro:IST$/], ['Antalya', /^ap:AYT$/], ['Hurghada', /^ap:HRG$/],
  ['Dubaj', /^metro:DXB$/], ['Bangkok', /^metro:BKK$/], ['Peking', /^ap:PEK$/], ['Tokio', /^metro:TYO$/], ['Nový York', /^metro:NYC$/],
  ['Frankfurt nad Mohanem', /^metro:FRA$/], ['Sajgon', /^ap:SGN$/],
  // oblasti a ostrovy
  ['Toskánsko', /^rg:toskansko$/], ['Dolomity', /^rg:dolomity$/], ['Korsika', /^rg:korsika$/], ['Sardinie', /^rg:sardinie$/],
  ['Sicílie', /^rg:sicilie$/], ['Algarve', /^rg:algarve$/], ['Bavorsko', /^rg:bavorsko$/], ['Tyrolsko', /^rg:tyrolsko$/],
  // bez diakritiky, malými, překlep
  ['benatky', VCE], ['londyn', /^metro:LON$/], ['mnichov', /^ap:MUC$/], ['kodan', /^ap:CPH$/], ['zahreb', /^ap:ZAG$/],
  ['carihrad', /^metro:IST$/], ['novy york', /^metro:NYC$/], ['ŘÍM', ROM], ['Bénatky', VCE], ['Lisabn', /^ap:LIS$/, true], ['Florecie', /^ap:FLR$/, true],
];

test('pole Kam: české názvy, oblasti, bez diakritiky a malými → první návrh (DEMO, i s geokódováním)', async () => {
  const mock = config.mock;
  config.mock = true;
  try {
    const bad = [];
    for (const [q, want, typo] of KAM) {
      const s = (await suggest(q))[0];
      if (!s || !want.test(s.id) || (s.fuzzy && !typo)) bad.push(`${q} → ${short(s)}`);
    }
    assert.deepEqual(bad, []);
  } finally {
    config.mock = mock;
  }
});

test('pořadí: přesné jméno letiště před oblastí s tím jménem, celá oblast hned za ním; Korsika celá, ne jen Bastia', () => {
  assert.deepEqual(localSuggestions('Hurghada', 3).map((s) => s.id), ['ap:HRG', 'rg:egypt-more']);
  assert.deepEqual(localSuggestions('Korsika', 3).map((s) => s.id), ['rg:korsika', 'ap:BIA', 'ap:AJA']);
  assert.equal(localSuggestions('Rudé moře', 1)[0].id, 'rg:egypt-more');
  // jednoletištní oblast zůstává před svým letištěm (Mallorca, Madeira)
  assert.equal(localSuggestions('Mallorca', 1)[0].id, 'rg:mallorca');
  // víceslovné exonymum ve tvaru věty
  assert.equal(localSuggestions('Nového Yorku', 1)[0].id, 'metro:NYC');
  assert.equal(localSuggestions('Frankfurtu nad Mohanem', 1)[0].id, 'metro:FRA');
});

// [věta, místo (ID)] – Kam i Odkud („z …“)
const VETY = [
  ['do Benátek', VCE], ['v Benátkách', VCE], ['z Benátek', VCE], ['v Mnichově', /^ap:MUC$/], ['do Mnichova', /^ap:MUC$/],
  ['do Říma', ROM], ['v Římě', ROM], ['na Krétu', /^rg:kreta$/], ['na Krétě', /^rg:kreta$/], ['na Maltu', /^cc:MT$/],
  ['ve Vídni', /^ap:VIE$/], ['do Vídně', /^ap:VIE$/], ['vidni', /^ap:VIE$/], ['do Drážďan', /^ap:DRS$/], ['v Drážďanech', /^ap:DRS$/],
  ['do Londýna', /^metro:LON$/], ['v Paříži', /^metro:PAR$/], ['do Atén', /^ap:ATH$/], ['v Aténách', /^ap:ATH$/],
  ['do Katovic', /^ap:KTW$/], ['v Katovicích', /^ap:KTW$/], ['do Kodaně', /^ap:CPH$/], ['v Kodani', /^ap:CPH$/], ['do Lipska', /^ap:LEJ$/],
  ['do Malagy', /^ap:AGP$/], ['do Ženevy', /^ap:GVA$/], ['do Lisabonu', /^ap:LIS$/], ['do Soluně', /^ap:SKG$/], ['do Záhřebu', /^ap:ZAG$/],
  ['v Toskánsku', /^rg:toskansko$/], ['do Dolomit', /^rg:dolomity$/], ['v Dolomitech', /^rg:dolomity$/], ['na Sardinii', /^rg:sardinie$/],
  ['na Sicílii', /^rg:sicilie$/], ['na Kanáry', /^rg:kanary$/], ['na Kanárech', /^rg:kanary$/], ['na Korsiku', /^rg:korsika$/],
  ['do Bavorska', /^rg:bavorsko$/], ['do Tyrolska', /^rg:tyrolsko$/], ['na Mallorku', /^rg:mallorca$/], ['na Majorku', /^rg:mallorca$/],
  ['do Nového Yorku', /^metro:NYC$/], ['do Cařihradu', /^metro:IST$/], ['do Solnohradu', /^ap:SZG$/], ['do Štýrského Hradce', /\|Štýrský Hradec$|^ap:GRZ$/],
  ['Řím na prodloužený víkend', ROM], ['do Londýna na víkend', /^metro:LON$/], ['na Krétu na týden', /^rg:kreta$/], ['levně do Paříže', /^metro:PAR$/],
  // odkud: město (okruh letišť) nebo jeho letiště – ne Lincoln (USA) z „Linc…“ ani Libérie z „Liber…“
  ['z Brna', /\|Brno$|^ap:BRQ$/], ['z Prahy', /\|Praha$|^ap:PRG$/], ['z Lince', /\|Linec$|^ap:LNZ$/], ['z Liberce', /\|Liberec$/],
  ['z Olomouce', /\|Olomouc$/], ['z Pardubic', /\|Pardubice$|^ap:PED$/], ['z Plzně', /\|Plzeň$/], ['z Katovic', /\|Katovice$|^ap:KTW$/],
];

test('místo z věty (pole Kam/Odkud, chytré hledání): tvary do/v/z/na → základní tvar z vlastních dat', () => {
  const bad = VETY.map(([q, want]) => [q, fromSentence(q)]).filter(([q, s]) => !s || s.fuzzy || !VETY.find((v) => v[0] === q)[1].test(s.id)).map(([q, s]) => `${q} → ${short(s)}`);
  assert.deepEqual(bad, []);
});

test('tvary slova: stems (koncovky množného čísla, vypadlé „e“, 2. pád na -y), nominatives (Vídni, Benátkách, Katovicích, Lince)', () => {
  const S = (w) => [...Smart.stems(w)];
  assert.deepEqual(S('Benátkách'), ['Benátkách', 'Benátkác', 'Benátká', 'Benátk']);
  assert.deepEqual(S('Kanárech'), ['Kanárech', 'Kanárec', 'Kanáre', 'Kanár']);
  assert.ok(S('Lince').includes('Linec'));
  assert.ok(S('Liberce').includes('Liberec'));
  assert.ok(S('Malagy').includes('Malaga'));
  assert.deepEqual(S('Vídně'), ['Vídně', 'Vídn', 'Víd'], 'beze změny');
  const N = (w) => [...Smart.nominatives(w)];
  for (const [w, nom] of [['Vídni', 'Vídeň'], ['Plzni', 'Plzeň'], ['Benátkách', 'Benátky'], ['Aténách', 'Atény'], ['Katovicích', 'Katovice'], ['Lince', 'Linec'], ['Liberci', 'Liberec'], ['Kanárech', 'Kanáry']]) {
    assert.ok(N(w).includes(nom), `${w} → ${nom}: ${N(w).join(', ')}`);
    assert.equal(N(w)[0], w, 'původní tvar první');
  }
  // přesná shoda tvaru bez koncovky vyhraje nad zemí ze zkráceného tvaru
  assert.equal(Smart.bestPlace([{ q: 'Liber', items: [{ id: 'cc:LR', label: 'Libérie', type: 'country' }] }, { q: 'Liberec', items: [{ id: 'geo:50.7671,15.0562|Liberec', label: 'Liberec', type: 'city' }], local: true }]).id, 'geo:50.7671,15.0562|Liberec');
  // geokódované místo (ne z vlastních dat) dál až za známým letištěm
  assert.equal(Smart.bestPlace([{ q: 'Vídně', items: [{ id: 'geo:42.8,18.4|Vidne', label: 'Vidne', type: 'place' }] }, { q: 'Víd', items: [{ id: 'ap:VIE', label: 'Vídeň', type: 'airport' }] }]).id, 'ap:VIE');
});

test('Objevuj: oblast přesným názvem → město jejího největšího letiště s klíčem oblasti; jinde (průvodce, střed cíle) ne', async () => {
  const mock = config.mock;
  config.mock = true;
  try {
    const first = async (q, regions = true) => (await geocodeExplore(q, { mapy: false, regions }))[0];
    for (const [q, label, region] of [['Toskánsko', 'Florencie', 'toskansko'], ['Kanáry', 'Santa Cruz de Tenerife', 'kanary'], ['Mallorka', 'Palma de Mallorca', 'mallorca'],
      ['Kréta', 'Herákleion', 'kreta'], ['Rhodos', 'Rhodes', 'rhodos'], ['Korsika', 'Ajaccio', 'korsika'], ['Bavorsko', 'Mnichov', 'bavorsko'], ['Tyrolsko', 'Innsbruck', 'tyrolsko'],
      ['Sicílie', 'Palermo', 'sicilie'], ['Sardinie', 'Cagliari', 'sardinie'], ['Provence', 'Marseille', 'provence'], ['Normandie', 'Caen', 'normandie'],
      ['Lofoty', 'Leknes', 'lofoty'], ['Goa', 'Goa', 'goa']]) {
      const s = await first(q);
      assert.deepEqual([s?.label, s?.region], [label, region], q);
      assert.ok(Number.isFinite(s.lat) && Number.isFinite(s.lon), q);
    }
    assert.equal((await first('Tosk'))?.region, undefined, 'začátek názvu ne – jen přesná shoda');
    assert.equal((await first('Toskánsko', false))?.region, undefined, 'bez regions (api/geocode bez mapy=1) beze změny');
    assert.equal((await first('Benátky')).label, 'Benátky', 'město zůstává městem');
    // Dolomity jsou i hory (server/lib/names.js NATURE): napřed hory, ne Verona (test/nature.test.js)
    assert.deepEqual([(await first('Dolomity'))?.label, (await first('Dolomity'))?.nature], ['Dolomity', 'range']);
    // stejnojmenná místa jinde ne: vesnice Provence ve Švýcarsku, Goa na Filipínách
    assert.equal((await first('Provence')).cc, 'FR');
    assert.equal((await first('Goa')).cc, 'IN');
    // oblasti, které nejsou správním celkem, jako příroda (střed a okruh v km): Cinque Terre, Solná komora, Gardské jezero
    for (const [q, label, nature] of [['Cinque Terre', 'Cinque Terre', 'park'], ['Salzkammergut', 'Solná komora', 'lake'], ['Lago di Garda', 'Gardské jezero', 'lake']]) {
      const s = await first(q);
      assert.deepEqual([s?.label, s?.nature], [label, nature], q);
    }
  } finally {
    config.mock = mock;
  }
});

test('Objevuj, věta: místo ve tvaru z věty (smartPlace) – exonymum, množné číslo, oblast, odkud (DEMO)', async () => {
  const mock = config.mock;
  config.mock = true;
  try {
    // Solnohrad → Salcburk (vlastní data) → geokodér: GeoNames má „Salcburk“ jen jako nepreferované české jméno, název je
    // „Salzburg“ jako dřív u Open-Meteo v provozu (DEMO dřív bralo název z vlastních dat)
    for (const [text, want] of [['do Benátek', 'Benátky'], ['v Benátkách', 'Benátky'], ['ve Vídni', 'Vídeň'], ['v Mnichově', 'Mnichov'],
      ['do Drážďan', 'Drážďany'], ['do Říma', 'Řím'], ['na Maltu', 'Malta'], ['v Toskánsku', 'Florencie'], ['na Krétu', 'Heraklion'],
      ['z Brna', 'Brno'], ['do Solnohradu', 'Salzburg'], ['v Katovicích', 'Katovice']]) {
      const px = Smart.parseExplore(`co vidět ${text}`, { today });
      const s = await T.smartPlace(px.place);
      assert.equal(s && s.label.replace(/\s*\(.*\)$/, ''), want, text);
    }
  } finally {
    config.mock = mock;
  }
});

test('Objevuj, věta: město ve své zemi, ne stejnojmenné jinde; země = hlavní město; překlep „Amstrdam“ (DEMO)', async () => {
  const mock = config.mock;
  config.mock = true;
  ctx.byIso = { IT: { cs: 'Itálie', capCs: 'Řím', cap: 'Rome' } }; // app.js načítá země až v prohlížeči
  try {
    // Amsterdam česky „Amsterodam“ – shoda podle názvu by vzala městečko v USA
    for (const [text, label, cc] of [['Amsterdam na 3 dny', 'Amsterodam', 'NL'], ['Amsterodam na 3 dny', 'Amsterodam', 'NL'],
      ['Singapur na 3 dny', 'Singapore', 'SG'], ['Goa na týden', 'Goa', 'IN'], ['Alexandria na 2 dny', 'Alexandrie', 'EG'],
      ['Itálie na týden', 'Řím', 'IT'], ['Amstrdam na 3 dny', 'Amsterodam', 'NL']]) {
      const px = Smart.parseExplore(text, { today });
      const s = await T.smartPlace(px.place);
      assert.deepEqual([s?.label, s?.cc], [label, cc], `${text} [${px.place}]`);
      assert.ok(Number.isFinite(+s.lat) && Number.isFinite(+s.lon), text);
    }
  } finally {
    config.mock = mock;
    delete ctx.byIso;
  }
});

test('Objevuj, věta: „do Českého Krumlova“, „do Kutné Hory“ – geokodér dostane 1. pád (Český Krumlov), ne „Českého Krumlov“', async () => {
  // geokodér zná jen základní tvar
  for (const [phrase, want] of [['Českého Krumlova', 'Český Krumlov'], ['Kutné Hory', 'Kutná Hora']]) {
    geoAsked.length = 0;
    const s = await T.smartPlace(phrase);
    assert.deepEqual([s?.label, s?.cc], [want, 'CZ'], phrase);
    assert.equal(geoAsked[0], want, `první dotaz na geokodér je 1. pád: ${geoAsked.join(' | ')}`);
  }
});
