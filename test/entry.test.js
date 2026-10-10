// Vstupní podmínky pro občany ČR: kontrola dat (data/entry.json) a logika z public/js/entry.js
// (čipy, tranzit, platnost pasu, „Před cestou“, poplatky, připomínka do kalendáře) – klasické skripty
// prohlížeče načtené přes node:vm; esc/safeUrl/czk… jsou skutečné řádky z app.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { makeLeg } from '../server/lib/fares.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const ENTRY = JSON.parse(read('data/entry.json'));
const COUNTRIES = JSON.parse(read('data/countries.json'));
const BY = Object.fromEntries(ENTRY.countries.map((r) => [r.iso2, r]));

function load({ withTrip = false } = {}) {
  const ctx = { window: {}, URLSearchParams, TextEncoder, TextDecoder, btoa, atob, console, URL };
  vm.createContext(ctx);
  vm.runInContext(read('public/js/ics.js'), ctx, { filename: 'ics.js' });
  const helpers = read('public/js/app.js').match(/^const (esc|safeUrl|pad|fmtYMD|fmtDate|czk) = .*$/gm);
  assert.equal(helpers.length, 6);
  vm.runInContext(`const Ics = window.Ics;\n${helpers.join('\n')}\nvar byIso = {}; var S = {}; var flag = (iso) => '[' + iso + ']';`, ctx, { filename: 'app-helpers.js' });
  for (const c of COUNTRIES) vm.runInContext(`byIso[${JSON.stringify(c.iso2)}] = ${JSON.stringify({ cs: c.cs })};`, ctx);
  vm.runInContext(read('public/js/entry.js'), ctx, { filename: 'entry.js' });
  vm.runInContext('var Entry = window.Entry;', ctx); // v prohlížeči je window globální objekt
  if (withTrip) vm.runInContext(read('public/js/trip.js'), ctx, { filename: 'trip.js' });
  ctx.window.Entry.set(JSON.parse(JSON.stringify(ENTRY)));
  ctx.window.Entry.setRate(25);
  return ctx;
}
const ctx = load();
const { Entry, Ics } = ctx.window;
const plain = (x) => JSON.parse(JSON.stringify(x));
// toLocaleString('cs-CZ') dělí tisíce pevnou mezerou – v testech jako obyčejná mezera
const sp = (s) => String(s).replace(/\u00a0/g, ' ');

/* ---------- data ---------- */
const ENUM = ['none', 'eu', 'eta', 'evisa', 'voa', 'visa'];
const KEYS = ['iso2', 'visa', 'idCard', 'maxStayDays', 'etaName', 'etaCostEur', 'etaUrl', 'transitEta', 'passportValidity', 'vaccinesRequired', 'vaccinesRecommended', 'notes', 'validUntil', 'source', 'verified'];
// Zprostředkovatelé a agentury – na jejich weby nikdy neodkazovat (vybírají několikanásobek poplatku).
const AGENCY = /ivisa|visahq|atlys|visasnews|visa-?central|cibt|evisa-?express|esta-?(online|us|form|apply)|(online|apply|fast|easy|my|go)-?visa|visa-?(online|apply|service|go|direct)|e-?visas?\.(com|org|net|co)\b|travel-?visa|eta-?(online|form|apply|canada|uk)|(canada|uk|us)-?eta|visagov|govisa|esta\.us/i;
// Oficiální weby, které nemají vládní doménu (portály úřadů, provozovatelé pověření vládou) – nový musí někdo zkontrolovat.
const OFFICIAL_OTHER = new Set(['evisa.bj', 'www.visaburkina.bf', 'evisa.dgdi.ga', 'eservice.evisa.iq', 'www.evisacam.cm', 'www.canada.ca', 'evisacuba.cu', 'evisamada-mg.com',
  'snedai.com', 'www.equatorialguinea-evisa.com', 'evisa.kdmid.ru', 'visa.visitsaudi.com', 'seychelles.govtas.com', 'www.evisa.sl', 'suriname.vfsevisa.com', 'www.knatravelform.kn', 'evisa.mfa.ir', 'evisa.td']);
const GOV = /(^|\.)(gov|gouv|govt|go|gob|gub|gv)\.[a-z]{2}$|\.gov$|(^|\.)gov\.[a-z]{2}\.?$/;

test('entry.json: metadata a přesně 197 zemí jako data/countries.json (stejné pořadí)', () => {
  assert.equal(ENTRY.checked, '2026-10');
  assert.equal(ENTRY.source, 'MZV ČR – Informace pro cestovatele');
  assert.match(ENTRY.sourceUrl, /^https:\/\/www\.mzv\.gov\.cz\//);
  assert.match(ENTRY.note, /informativní/i);
  assert.equal(ENTRY.countries.length, 197);
  assert.deepEqual(ENTRY.countries.map((r) => r.iso2), COUNTRIES.map((c) => c.iso2));
  assert.equal(new Set(ENTRY.countries.map((r) => r.iso2)).size, 197);
  assert.ok(ENTRY.countries.filter((r) => r.verified).length >= 194, 'ověřených aspoň 194');
});

test('entry.json: pole, typy a hodnoty každé země', () => {
  for (const r of ENTRY.countries) {
    const at = r.iso2;
    assert.deepEqual(Object.keys(r).filter((k) => !KEYS.includes(k)), [], `${at}: neznámé pole`);
    assert.ok(ENUM.includes(r.visa), `${at}: visa ${r.visa}`);
    assert.equal(typeof r.idCard, 'boolean', at);
    assert.equal(typeof r.verified, 'boolean', at);
    assert.ok(r.maxStayDays === null || (Number.isInteger(r.maxStayDays) && r.maxStayDays > 0 && r.maxStayDays <= 400), `${at}: maxStayDays`);
    assert.ok(r.etaCostEur === null || (typeof r.etaCostEur === 'number' && r.etaCostEur >= 0 && r.etaCostEur < 500), `${at}: etaCostEur`);
    for (const f of ['passportValidity', 'vaccinesRequired', 'vaccinesRecommended', 'notes']) assert.equal(typeof r[f], 'string', `${at}: ${f}`);
    assert.ok(r.etaName === null || (typeof r.etaName === 'string' && r.etaName.length > 1), `${at}: etaName`);
    assert.ok(r.notes.length >= 10 && r.notes.length <= 200, `${at}: poznámka ${r.notes.length} znaků`);
    assert.ok(r.passportValidity.length > 0, `${at}: platnost pasu`);
    // žádné HTML ani řídicí znaky – texty se sice escapují, ale data mají být čistý text
    for (const [k, v] of Object.entries(r)) if (typeof v === 'string') assert.ok(!/[<>\u0000-\u001f]|&[a-z#0-9]+;/i.test(v), `${at}.${k}: HTML nebo řídicí znak`);
    assert.match(r.source, /^https:\/\/[^\s]+$/, `${at}: zdroj`);
    if (r.etaUrl !== null) assert.match(r.etaUrl, /^https:\/\/[^\s]+$/, `${at}: etaUrl`);
    // dočasný režim: datum a totéž datum v poznámce
    if (r.validUntil !== undefined) {
      assert.match(r.validUntil, /^\d{4}-\d{2}-\d{2}$/, `${at}: validUntil`);
      const [y, m, d] = r.validUntil.split('-').map(Number);
      assert.ok(r.notes.includes(`${d}. ${m}. ${y}`), `${at}: datum ${r.validUntil} v poznámce`);
    }
  }
  assert.deepEqual(ENTRY.countries.filter((r) => r.validUntil).map((r) => r.iso2).sort(), ['KR', 'MN', 'VN']); // BY: přes letiště Minsk bez data, do 31. 12. 2026 jen pozemní hranice
});

test('entry.json: režimy dávají smysl (registrace má název a web, OP jen bez víza, tranzit jen u registrace)', () => {
  for (const r of ENTRY.countries) {
    const at = `${r.iso2} (${r.visa})`;
    if (r.visa === 'eta' || r.visa === 'evisa') {
      assert.ok(r.etaName, `${at}: chybí název registrace / e-víza`);
      assert.ok(r.etaUrl, `${at}: chybí oficiální web`);
    }
    if (r.etaCostEur !== null) assert.ok(r.etaName, `${at}: cena bez názvu`);
    if (r.etaUrl !== null) assert.ok(r.etaName, `${at}: web bez názvu`);
    if (r.idCard) assert.ok(r.visa === 'eu' || r.visa === 'none', `${at}: OP stačí jen bez víza`);
    if (r.visa === 'eu') assert.ok(r.idCard, `${at}: EU bez OP`);
    if (r.transitEta !== undefined) {
      // true = i letištní tranzit, 'landside' = jen přestup přes pasovou kontrolu
      assert.ok(r.transitEta === true || r.transitEta === 'landside', at);
      assert.equal(r.visa, 'eta', `${at}: tranzit jen u registrace`);
      assert.match(r.notes, /tranzit/i, `${at}: tranzit musí být v poznámce`);
    }
  }
  assert.deepEqual(ENTRY.countries.filter((r) => r.transitEta).map((r) => `${r.iso2}:${r.transitEta}`).sort(), ['CA:true', 'GB:landside', 'US:true']);
  assert.equal(ENTRY.countries.filter((r) => r.visa === 'eu').length, 31, 'EU + Island, Norsko, Lichtenštejnsko, Švýcarsko');
});

test('entry.json: odkazy na registrace a e-víza jen na oficiální weby, nikdy na zprostředkovatele', () => {
  for (const r of ENTRY.countries) {
    for (const u of [r.etaUrl, r.source].filter(Boolean)) {
      const host = new URL(u).hostname;
      // vládní doména nebo ručně ověřený portál (OFFICIAL_OTHER) – jinak nesmí připomínat agenturu
      assert.ok(GOV.test(host) || OFFICIAL_OTHER.has(host) || !AGENCY.test(host), `${r.iso2}: ${u} vypadá jako zprostředkovatel`);
    }
    if (!r.etaUrl) continue;
    const host = new URL(r.etaUrl).hostname;
    assert.ok(GOV.test(host) || OFFICIAL_OTHER.has(host), `${r.iso2}: ${host} není vládní doména ani známý oficiální portál – zkontroluj a případně doplň do OFFICIAL_OTHER`);
  }
  // kontrola kontroly: typické agentury síto zachytí
  for (const h of ['www.ivisa.com', 'esta-online.us', 'www.visahq.com', 'canada-eta.org', 'uk-eta.com', 'e-visa.co', 'evisa-express.com', 'onlinevisa.com']) assert.ok(AGENCY.test(h), h);
  for (const h of ['esta.cbp.dhs.gov', 'www.gov.uk', 'indianvisaonline.gov.in', 'nzeta.immigration.govt.nz', 'etakenya.go.ke']) assert.ok(GOV.test(h), h);
  for (const h of ['www.ivisa.com', 'gov.uk.eta-online.com', 'esta.gov.us.com']) assert.ok(!GOV.test(h), `${h} není vládní`);
});

/* ---------- čipy ---------- */
test('kind/čip země: stačí OP, registrace, e-vízum, vízum na hranici, vízum předem, bez víza', () => {
  const k = (iso) => { const x = Entry.kind(Entry.get(iso)); return [x.key, x.icon, x.label, x.need]; };
  assert.deepEqual(plain(k('DE')), ['op', '🪪', 'stačí OP', false]);
  assert.deepEqual(plain(k('AL')), ['op', '🪪', 'stačí OP', false]);
  assert.deepEqual(plain(k('TH')), ['free', '', 'bez víza', false]);
  assert.deepEqual(plain(k('US')), ['eta', '🛂', 'ESTA', true]);
  assert.deepEqual(plain(k('CA')), ['eta', '🛂', 'eTA', true]);
  assert.deepEqual(plain(k('GB')), ['eta', '🛂', 'ETA', true]);
  assert.deepEqual(plain(k('NZ')), ['eta', '🛂', 'NZeTA', true]);
  assert.deepEqual(plain(k('SC')), ['eta', '🛂', 'registrace', true], 'dlouhý název → obecné slovo');
  assert.deepEqual(plain(k('IN')), ['evisa', '🛂', 'e-vízum', true]);
  assert.deepEqual(plain(k('EG')), ['voa', '🛂', 'vízum na hranici', true]);
  assert.deepEqual(plain(k('CN')), ['visa', '📄', 'vízum předem', true]);
  assert.equal(Entry.kind(null), null);
  // Austrálie: eVisitor je podle MZV vízum – text nesmí tvrdit „bez víza“; názvy se závorkou se nevnořují
  assert.equal(Entry.kind(Entry.get('AU')).text, 'Nutná online registrace předem: eVisitor (subclass 651)');
  assert.equal(Entry.kind(Entry.get('CA')).text, 'Nutná online registrace předem: eTA (Canada)');
  assert.equal(Entry.kind(Entry.get('IN')).text, 'Nutné e-vízum, vyřídíš online předem: e-Visa (e-Tourist Visa)');
  assert.equal(Entry.kind(Entry.get('IR')).text, 'Vízum předem na zastupitelském úřadě; online žádost: E-VISA (online žádost, vízum vydá ambasáda)');
  for (const r of ENTRY.countries) assert.ok(!/\([^()]*\(/.test(Entry.kind(r).text), `${r.iso2}: vnořené závorky`);
  // neověřený záznam: „?“ za štítkem a v bublině „neověřeno“, ne „ověřeno 10/2026“
  assert.match(Entry.cardChip('SY'), />🛂 vízum na hranici\?<\/span>$/);
  assert.match(Entry.cardChip('SY'), /stav 10\/2026, neověřeno na oficiální stránce/);
  assert.doesNotMatch(Entry.cardChip('SY'), /ověřeno 10\/2026\)/);
  assert.match(Entry.flightChip('TM'), />🛂 e-vízum\?<\/span>$/);

  assert.match(Entry.cardChip('US'), /^<span class="ec ec-reg" title="[^"<>]*">🛂 ESTA<\/span>$/);
  assert.match(Entry.cardChip('DE'), />🪪 stačí OP</);
  assert.match(Entry.cardChip('TH'), />bez víza</);
  assert.equal(Entry.cardChip('CZ'), '', 'domov bez čipu');
  assert.equal(Entry.cardChip('XX'), '');
  assert.match(Entry.cardChip('US'), /title="Spojené státy americké: Nutná online registrace předem: ESTA – ~36 € \(≈ 900 Kč\)\. Pobyt: 90 dní\./);
});

test('čip u letu jen když je co vyřizovat; cena v €, „zdarma“, escapování textů z dat', () => {
  assert.match(Entry.flightChip('US'), />🛂 ESTA 36 €<\/span>$/);
  assert.match(Entry.flightChip('GB'), />🛂 ETA 23 €</);
  assert.match(Entry.flightChip('LK'), />🛂 ETA zdarma</);
  assert.match(Entry.flightChip('IN'), />🛂 e-vízum 22 €</);
  assert.match(Entry.flightChip('EG'), />🛂 vízum na hranici</);
  assert.match(Entry.flightChip('CN'), />📄 vízum předem</);
  for (const iso of ['DE', 'AL', 'TH', 'TR', 'CZ', '', null, 'XX']) assert.equal(Entry.flightChip(iso), '', String(iso));
  // Korea: výjimka z K-ETA do 31. 12. 2026 – cesta v lednu 2027 dostane „⏳ ověř vstup“, prosincová ne
  assert.match(Entry.flightChip('KR', '2027-01-05'), /^<span class="b ec-b ec-visa" title="Jižní Korea: Tento režim platí podle MZV zatím do 31\. 12\. 2026[^"]*">⏳ ověř vstup<\/span>$/);
  assert.equal(Entry.flightChip('KR', '2026-12-31'), '');
  assert.equal(Entry.flightChip('KR'), '');
  assert.match(Entry.flightChip('US', '2027-01-05'), />🛂 ESTA 36 €</);
  assert.match(Entry.idNote('AL'), /🪪 stačí OP/);
  assert.equal(Entry.idNote('US'), '');
  assert.equal(Entry.idNote('CZ'), '');

  const evil = load();
  const data = JSON.parse(JSON.stringify(ENTRY));
  Object.assign(data.countries.find((r) => r.iso2 === 'US'), { etaName: '<img src=x onerror=alert(1)>', notes: '"><script>alert(1)</script>', etaUrl: 'javascript:alert(1)' });
  Object.assign(data.countries.find((r) => r.iso2 === 'IN'), { etaCostEur: '<script>alert(2)</script>', etaName: '<b>x</b>' });
  evil.window.Entry.set(data);
  for (const html of [evil.window.Entry.flightChip('US'), evil.window.Entry.cardChip('US'), evil.window.Entry.detailHtml('US'), evil.window.Entry.checklistHtml(['US'], { ret: '2027-01-10' }),
    evil.window.Entry.flightChip('IN'), evil.window.Entry.detailHtml('IN'), evil.window.Entry.checklistHtml(['IN'], { ret: '2027-01-10' }), evil.window.Entry.transitHtml([{ layovers: [{ at: '<i>', cc: 'US' }] }], 'MX')]) {
    assert.ok(!/<img|<script|javascript:|<b>x<|<i>/i.test(html), html.slice(0, 200));
  }
});

/* ---------- tranzit ---------- */
test('tranzit: přestup v USA / Kanadě → varování; cíl v té zemi, jiné země a let bez přestupu ne', () => {
  const via = (...ccs) => ({ layovers: ccs.map(([at, cc]) => ({ at, min: 120, cc })) });
  assert.deepEqual(plain(Entry.transit([via(['JFK', 'US'])], 'MX')).map((w) => w.text), ['✈︎ přestup v USA – i tranzit vyžaduje ESTA']);
  assert.deepEqual(plain(Entry.transit([via(['YYZ', 'CA'])], 'MX')).map((w) => w.text), ['✈︎ přestup v Kanadě – i tranzit vyžaduje eTA']);
  // tam přes JFK, zpět přes MIA → jedno varování; cíl USA → žádné (řeší čip cíle)
  assert.equal(Entry.transit([via(['JFK', 'US']), via(['MIA', 'US'], ['MAD', 'ES'])], 'CR').length, 1);
  assert.equal(Entry.transit([via(['JFK', 'US'])], 'US').length, 0);
  assert.equal(Entry.transit([via(['YYZ', 'CA'], ['JFK', 'US'])], ['US', 'CA']).length, 0, 'víc cílových zemí');
  assert.equal(Entry.transit([via(['IST', 'TR'], ['DXB', 'AE'], ['NBO', 'KE'])], 'TH').length, 0, 'jen země s transitEta (Keňa: letištní tranzit bez eTA)');
  // Británie: ETA jen při přestupu přes pasovou kontrolu (MZV) – podmíněné varování
  const uk = plain(Entry.transit([via(['LHR', 'GB'])], 'US'));
  assert.deepEqual(uk.map((w) => [w.cc, w.landside, w.text]), [['GB', true, '✈︎ přestup ve Velké Británii – s pasovou kontrolou nutná ETA']]);
  assert.match(uk[0].title, /pasovou kontrolou/);
  assert.match(Entry.transitHtml([via(['LHR', 'GB'])], 'US'), /^<span class="b warn ec-warn"/);
  // území USA (Portoriko): v databázi letišť PR, pravidla USA – cíl San Juan = ESTA, přestup tam = jako v USA
  assert.deepEqual(plain(Entry.transit([via(['SJU', 'PR'])], 'DO')).map((w) => w.text), ['✈︎ přestup v USA – i tranzit vyžaduje ESTA']);
  assert.equal(Entry.transit([via(['JFK', 'US'])], 'PR').length, 0, 'cíl Portoriko = USA');
  assert.match(Entry.flightChip('PR'), />🛂 ESTA 36 €</);
  assert.match(Entry.flightChip('PR'), /title="Portoriko \(USA\): /);
  assert.deepEqual(plain(Entry.transitCcs([via(['JFK', 'US'], ['LHR', 'GB'])], 'MX')), ['US', 'GB']);
  // kód země ze sdíleného odkazu (cizí vstup) nesmí sáhnout na Object.prototype
  for (const cc of ['constructor', 'CONSTRUCTOR', '__proto__', 'toString', 'hasOwnProperty']) {
    assert.equal(Entry.get(cc), null, cc);
    assert.equal(Entry.transit([via(['XXX', cc])], 'MX').length, 0, cc);
  }
  assert.equal(Entry.transit([{ stops: 0 }, null, { layovers: [{ at: 'JFK', min: 90 }] }], 'MX').length, 0, 'bez země přestupu nic');
  const html = Entry.transitHtml([via(['JFK', 'US'])], 'MX');
  assert.match(sp(html), /^<span class="b hot ec-warn" title="JFK: ESTA je nutná i při přestupu na letišti – ~36 € \(≈ 900 Kč\)\. Zdroj: MZV ČR \(ověřeno 10\/2026\)\.">✈︎ přestup v USA – i tranzit vyžaduje ESTA<\/span>$/);
});

test('makeLeg: přestupy dostanou zemi letiště z databáze (JFK → US), neznámé letiště null', () => {
  const l = makeLeg({ provider: 'kiwi', from: 'PRG', to: 'CUN', dep: '2026-12-01T07:00:00', arr: '2026-12-01T19:00:00', price: 500, currency: 'EUR', stops: 2, layovers: [{ at: 'JFK', min: 150 }, { at: 'QQQ', min: 60 }] });
  assert.deepEqual(l.layovers, [{ at: 'JFK', min: 150, cc: 'US' }, { at: 'QQQ', min: 60, cc: null }]);
  assert.equal(Entry.transit([l], 'MX')[0].cc, 'US');
});

/* ---------- platnost pasu ---------- */
test('platnost pasu: měsíce i dny od data návratu, konec měsíce, přestupný rok, bez lhůty null', () => {
  assert.equal(Entry.passportUntil('6 měsíců po vstupu', '2026-12-14'), '2027-06-14');
  assert.equal(Entry.passportUntil('3 měsíce po plánovaném odjezdu', '2026-11-30'), '2027-02-28', '30. 11. + 3 měsíce → konec února');
  assert.equal(Entry.passportUntil('6 měsíců', '2027-08-31'), '2028-02-29', 'přestupný rok');
  assert.equal(Entry.passportUntil('1 měsíc po vstupu', '2026-01-31'), '2026-02-28');
  assert.equal(Entry.passportUntil('min. 150 dní od vstupu (60 dní po skončení povoleného pobytu)', '2026-12-01'), '2027-04-30');
  // doporučení zvlášť: povinná lhůta 3 měsíce, doporučeno 6
  assert.deepEqual(plain(Entry.passportDates('3 měsíce po plánovaném odjezdu (doporučeno 6 měsíců)', '2026-12-14')), { until: '2027-03-14', rec: '2027-06-14' });
  assert.deepEqual(plain(Entry.passportDates('po dobu pobytu (doporučeno o 2 měsíce déle)', '2026-12-14')), { until: null, rec: '2027-02-14' });
  assert.deepEqual(plain(Entry.passportDates('6 měsíců po odjezdu (doporučeno)', '2026-12-14')), { until: null, rec: '2027-06-14' }, 'doporučení v závorce za lhůtou');
  assert.deepEqual(plain(Entry.passportDates('doporučeno 6 měsíců; MZV: min. 3 měsíce po skončení pobytu', '2026-12-14')), { until: '2027-03-14', rec: '2027-06-14' });
  assert.deepEqual(plain(Entry.passportDates('30 dní po plánovaném odjezdu (MZV doporučuje 90 dní), 2 volné strany', '2026-12-14')), { until: '2027-01-13', rec: '2027-03-14' });
  // zápor: „6 měsíců není úředně vyžadováno“ (Austrálie) není lhůta
  assert.deepEqual(plain(Entry.passportDates(BY.AU.passportValidity, '2026-12-14')), { until: null, rec: null });
  assert.equal(Entry.passportUntil(BY.KR.passportValidity, '2026-12-14'), '2027-06-14', 'Korea: MZV „musí být alespoň 6 měsíců“');
  assert.equal(Entry.passportUntil('biometrický pas min. 6 měsíců (180 dnů) od data vstupu', '2026-12-14'), '2027-06-14');
  assert.equal(Entry.passportUntil('po dobu pobytu', '2026-12-14'), null);
  assert.equal(Entry.passportUntil('stačí platný OP nebo pas', '2026-12-14'), null);
  assert.equal(Entry.passportUntil('6 měsíců po vstupu', null), null);
  assert.equal(Entry.passportUntil('6 měsíců po vstupu', '2026-13-01'), null);
  assert.deepEqual(plain(Entry.passportRule('6 měsíců po vstupu, 2 volné stránky')), { months: 6, days: 0, recMonths: 0, recDays: 0 }, 'stránky nejsou lhůta');
  // všechna pravidla v datech se dají přečíst (bez výjimky)
  for (const r of ENTRY.countries) Entry.passportUntil(r.passportValidity, '2026-12-31');
});

/* ---------- předstih a připomínka ---------- */
test('předstih z poznámek: dny předem, pracovní dny, hodiny, „až 45 dní“; „nejdříve / až N dní předem“ ne', () => {
  const lead = (iso) => Entry.leadDays(Entry.get(iso));
  assert.equal(lead('IN'), 4, 'žádat min. 4 dny předem');
  assert.equal(lead('KE'), 5, '3 prac. dny ≈ 5 dní');
  assert.equal(lead('IL'), 3, '72 h předem');
  assert.equal(lead('GN'), 45, 'vyřízení až 45 dní');
  assert.equal(lead('PK'), 14, '7–10 prac. dní');
  assert.equal(lead('US'), null);
  assert.equal(Entry.leadDays({ notes: 'Formulář lze vyplnit online až 15 dní předem, karta nejdříve 3 dny před letem.' }), null);
  assert.equal(Entry.remindDays(Entry.get('US')), 14);
  assert.equal(Entry.remindDays(Entry.get('IN')), 14);
  assert.equal(Entry.remindDays(Entry.get('GN')), 52, '45 dní + týden rezerva');
  assert.equal(Entry.remindDays(Entry.get('CN')), 30, 'vízum na úřadě');
});

test('připomínka do kalendáře: „🛂 Vyřídit ESTA (USA)“ 14 dní před odletem; bez víza nic; pozdě = dnes', () => {
  const r = Entry.reminder('US', '2026-12-20', '2026-10-06');
  assert.equal(r.title, '🛂 Vyřídit ESTA (USA)');
  assert.equal(r.start, '2026-12-06');
  assert.equal(r.url, 'https://esta.cbp.dhs.gov/');
  assert.match(sp(r.description), /~36 € \(≈ 900 Kč\) na osobu/);
  assert.match(r.description, /Jen oficiální web: https:\/\/esta\.cbp\.dhs\.gov\//);
  assert.match(r.description, /Odlet: 20\. 12\. 2026\. Zdroj: MZV ČR \(ověřeno 10\/2026\)/);
  assert.equal(Entry.reminder('IN', '2026-12-20', '2026-10-06').title, '🛂 Vyřídit e-vízum (Indie)');
  assert.match(Entry.reminder('IN', '2026-12-20', '2026-10-06').description, /Na vyřízení si nech aspoň 4 dny\./);
  assert.match(Entry.reminder('KE', '2026-12-20', '2026-10-06').description, /aspoň 5 dní\./);
  assert.equal(r.uid, 'atlas-entry-US-2026-12-20', 'stálé UID – nový export připomínku přepíše');
  assert.equal(Entry.reminder('CN', '2026-12-20', '2026-10-06').start, '2026-11-20');
  assert.equal(Entry.reminder('CN', '2026-12-20', '2026-10-06').title, '🛂 Vyřídit vízum (Čína)');
  assert.equal(Entry.reminder('GN', '2026-12-20', '2026-10-06').start, '2026-10-29');
  for (const iso of ['DE', 'TH', 'AL', 'EG', 'CZ', 'XX']) assert.equal(Entry.reminder(iso, '2026-12-20', '2026-10-06'), null, iso);
  assert.equal(Entry.reminder('US', '2026-10-10', '2026-10-06').start, '2026-10-06', 'na 14 dní předem už je pozdě → dnes');
  assert.equal(Entry.reminder('US', '2026-10-06', '2026-10-06'), null, 'v den odletu už ne');
  assert.equal(Entry.reminder('US', 'zítra', '2026-10-06'), null);
  // všechny země cesty najednou: USA + Portoriko = jedna ESTA; přestup v USA (cíl Mexiko) má vlastní připomínku, Británie (jen s pasovou kontrolou) ne
  const all = plain(Entry.reminders(['US', 'PR', 'IN', 'TH'], '2026-12-20', '2026-10-06'));
  assert.deepEqual(all.map((x) => x.title), ['🛂 Vyřídit ESTA (USA)', '🛂 Vyřídit e-vízum (Indie)']);
  const tr = plain(Entry.reminders(['MX'], '2026-12-20', '2026-10-06', ['US', 'GB']));
  assert.deepEqual(tr.map((x) => [x.title, x.start]), [['🛂 Vyřídit ESTA (USA – přestup)', '2026-12-06']]);
  assert.match(tr[0].description, /Platí i při přestupu\./);
  assert.equal(Entry.reminders(['US'], '2026-12-20', '2026-10-06', ['US']).length, 1, 'cíl i přestup v USA = jedna připomínka');

  const ics = Ics.build([r], { now: Date.UTC(2026, 9, 6) }).replace(/\r\n /g, '');
  assert.match(ics, /\r\nUID:atlas-entry-US-2026-12-20\r\n/);
  assert.match(ics, /\r\nSUMMARY:🛂 Vyřídit ESTA \(USA\)\r\n/);
  assert.match(ics, /\r\nDTSTART;VALUE=DATE:20261206\r\n/);
  assert.match(ics, /\r\nURL:https:\/\/esta\.cbp\.dhs\.gov\/\r\n/);
});

/* ---------- před cestou ---------- */
test('„Před cestou“: doklady s datem platnosti pasu, registrace s cenou a odkazem, očkování; Česko a duplicity pryč', () => {
  const items = Entry.checklist(['TH', 'CZ', 'TH', 'AL', 'US', 'XX'], { ret: '2026-12-14' });
  assert.deepEqual(plain(items.map((x) => x.iso)), ['TH', 'AL', 'US']);
  assert.equal(items[0].docs, '🛂 Cestovní pas platný aspoň do 14. 6. 2027 – občanský průkaz nestačí');
  assert.equal(items[1].docs, '🪪 Stačí občanský průkaz (nebo pas) platný aspoň do 14. 3. 2027');
  assert.equal(items[2].docs, '🛂 Cestovní pas – občanský průkaz nestačí', 'USA: platnost po dobu pobytu');
  assert.equal(Entry.checklist(['DE'], {})[0].docs, '🪪 Stačí občanský průkaz (nebo pas)');
  // doporučení není povinnost: Japonsko „po dobu pobytu (doporučeno o 2 měsíce déle)“, Austrálie „6 měsíců není vyžadováno“
  assert.equal(Entry.checklist(['JP'], { ret: '2026-12-14' })[0].docs, '🛂 Cestovní pas (doporučená platnost aspoň do 14. 2. 2027) – občanský průkaz nestačí');
  assert.equal(Entry.checklist(['AU'], { ret: '2026-12-14' })[0].docs, '🛂 Cestovní pas – občanský průkaz nestačí');
  assert.equal(Entry.checklist(['ZA'], { ret: '2026-12-14' })[0].docs, '🛂 Cestovní pas platný aspoň do 13. 1. 2027 (doporučená platnost aspoň do 14. 3. 2027) – občanský průkaz nestačí');
  assert.equal(Entry.checklist(['MD'], { ret: '2026-12-14' })[0].docs, '🪪 Stačí občanský průkaz (nebo pas) – doporučená platnost aspoň do 14. 3. 2027');
  // přestup: země jen přestupu jako zvláštní položka, cílová země se neopakuje
  const via = plain(Entry.checklist(['MX'], { ret: '2026-12-14', via: ['US', 'MX', 'PR'] }));
  assert.deepEqual(via.map((x) => [x.iso, x.transit]), [['MX', false], ['US', true]]);
  assert.equal(plain(Entry.checklist(['MX'], { ret: '2026-12-14', via: ['CA'] }))[1].docs, '🛂 Cestovní pas – občanský průkaz nestačí', 'přestup: bez data platnosti (lhůta je pro vstup)');

  const html = sp(Entry.checklistHtml(['US', 'TH'], { ret: '2026-12-14', pax: 2 }));
  assert.match(html, /<h3>🛂 Před cestou<\/h3>/);
  assert.match(html, /Nutná online registrace předem: ESTA<\/b> · ~36 € \(≈ 900 Kč\) na osobu \(2 os\. ≈ 1 800 Kč\)/);
  assert.match(html, /<a href="https:\/\/esta\.cbp\.dhs\.gov\/" target="_blank" rel="noopener">oficiální web ↗<\/a>/);
  assert.match(html, /platí i při přestupu/);
  assert.match(html, /💉 Povinné očkování: žlutá zimnice při příletu z rizikové země/);
  assert.match(html, /aspoň do 14\. 6\. 2027/);
  // platnost pasu s popiskem, ne holá závorka za „OP nestačí“ (QA: „… nestačí (po dobu pobytu)“)
  assert.match(sp(Entry.checklistHtml(['GB'], { ret: '2026-12-14' })), /🛂 Cestovní pas – občanský průkaz nestačí <span class="faint">· platnost pasu: po celou dobu pobytu<\/span>/);
  assert.match(html, /nestačí <span class="faint">· platnost pasu: 6 měsíců po vstupu<\/span>/);
  assert.match(sp(Entry.checklistHtml(['AL'], { ret: '2026-12-14' })), /· platnost dokladu: /);
  assert.match(html, /před cestou vždy ověř aktuální podmínky na <a href="https:\/\/www\.mzv\.gov\.cz\/jnp\/cz\/cestujeme\/index\.html"/);
  assert.equal(Entry.checklistHtml(['CZ'], {}), '');
  assert.equal(Entry.checklistHtml([], {}), '');
  // přestup v USA na cestě do Mexika: ESTA s poznámkou, bez pobytu a očkování USA; Británie s podmínkou pasové kontroly
  const tr = sp(Entry.checklistHtml(['MX'], { ret: '2026-12-14', via: ['US', 'GB'] }));
  assert.match(tr, /<b>Spojené státy americké<\/b> <span class="faint">– jen přestup<\/span>/);
  assert.match(tr, /<b>Spojené království<\/b> <span class="faint">– jen přestup<\/span>/);
  assert.match(tr, /nutná i při přestupu, pokud procházíš pasovou kontrolou/);
  assert.equal((tr.match(/Pobyt nejvýš/g) || []).length, 1, 'pobyt jen u Mexika');
  // dočasný režim: upozornění jen když cesta končí po jeho konci
  assert.match(Entry.checklistHtml(['KR'], { ret: '2027-01-10' }), /<li class="ed-unv">⏳ Tento režim platí podle MZV zatím do 31\. 12\. 2026 – pro pozdější cestu ověř, co platí potom\.<\/li>/);
  assert.doesNotMatch(Entry.checklistHtml(['KR'], { ret: '2026-11-10' }), /⏳/);
  assert.match(Entry.detailHtml('MN'), /class="ed-unv">⏳ Tento režim platí podle MZV zatím do 31\. 12\. 2026/);
  // neověřený záznam: varování v seznamu
  assert.match(Entry.checklistHtml(['SY'], {}), /Tento záznam se nepodařilo ověřit na oficiální stránce/);
  assert.match(Entry.checklistHtml(['SY'], {}), />🛂 vízum na hranici\?<\/span>/);
});

test('vstupní poplatky: na osobu × cestující v Kč, jen kde se platí (zdarma a bez víza ne)', () => {
  assert.deepEqual(plain(Entry.costs(['US', 'DE', 'LK', 'AU', 'TH'], 2)), [{ iso: 'US', label: 'ESTA (USA) · 2 × ~36 €', eur: 72, czk: 1800 }]);
  assert.deepEqual(plain(Entry.costs(['EG'], 1)), [{ iso: 'EG', label: 'e-Visa (Egypt) · 1 × ~27 €', eur: 27, czk: 680 }]);
  assert.deepEqual(plain(Entry.costs(['CN'], 3)), [], 'vízum bez udané ceny');
  assert.deepEqual(plain(Entry.costs(['US', 'CA'], 1)).map((x) => x.label), ['ESTA (USA) · 1 × ~36 €', 'eTA (Kanada) · 1 × ~4 €']);
  // přestup: ESTA ano (platí vždy), britská ETA ne (jen s pasovou kontrolou – nejistá); USA + Portoriko jednou
  assert.deepEqual(plain(Entry.costs(['MX'], 2, ['US', 'GB'])), [{ iso: 'US', label: 'ESTA (USA, přestup) · 2 × ~36 €', eur: 72, czk: 1800 }]);
  assert.equal(Entry.costs(['US', 'PR'], 1).length, 1);
});

test('detail země: režim česky, pobyt, doklad, platnost pasu, cena v € a Kč, zdroj a upozornění', () => {
  const us = sp(Entry.detailHtml('US'));
  assert.match(us, /<h3>🛂 Vstup pro občany ČR<\/h3>/);
  assert.match(us, /Nutná online registrace předem: ESTA/);
  assert.match(us, /ESTA · <b>~36 € \(≈ 900 Kč\)<\/b> na osobu/);
  assert.match(us, /Nutná i při přestupu/);
  assert.match(us, />🛂 jen pas</);
  assert.match(us, />90 dní</);
  assert.match(us, /<div class="ed-wide"><div class="k">Platnost pasu<\/div>/, 'na mobilu přes celou šířku');
  assert.match(us, /Zdroj: MZV ČR \(ověřeno 10\/2026\)/);
  assert.match(Entry.detailHtml('DE'), /EU \/ Schengen – volný pohyb, stačí občanský průkaz/);
  assert.match(Entry.detailHtml('DE'), />volný pohyb osob</);
  assert.match(Entry.detailHtml('CH'), />volný pohyb osob</, 'Švýcarsko není v EU');
  assert.match(Entry.detailHtml('CN'), />podle víza</);
  assert.match(Entry.detailHtml('GB'), /Nutná i při přestupu, pokud procházíš pasovou kontrolou/);
  assert.doesNotMatch(Entry.detailHtml('AU'), /Bez víza/);
  assert.match(Entry.detailHtml('TH'), /Bez víza – jen s cestovním pasem/);
  assert.match(Entry.detailHtml('EG'), /Vízum při příletu, nebo předem online: e-Visa/);
  assert.match(Entry.detailHtml('CN'), /Vízum předem na zastupitelském úřadě/);
  assert.match(Entry.detailHtml('AL'), />🪪 stačí OP</);
  assert.match(Entry.detailHtml('SY'), /stav 10\/2026, neověřeno na oficiální stránce/);
  assert.match(Entry.detailHtml('SY'), /class="ed-unv">⚠️ Tento záznam se nepodařilo ověřit/);
  assert.doesNotMatch(Entry.detailHtml('US'), /ed-unv/);
  assert.equal(Entry.detailHtml('CZ'), '');
  assert.ok(Entry.matches('AL', 'op') && !Entry.matches('TH', 'op') && Entry.matches('TH', 'free') && !Entry.matches('US', 'free') && Entry.matches('US', ''));
});

/* ---------- průvodce cestou ---------- */
const leg = (from, to, date, dep, arr, fromTz, toTz) => ({ from, to, date, dep: `${date}T${dep}:00`, arr: `${date}T${arr}:00`, hasTime: true, fromTz, toTz, carrier: 'DA', carrierName: 'Demo Air', flightNo: 'DA 1', provider: 'demo-air', bookUrl: 'https://air.example/b' });
const usTrip = () => ({
  v: 1, adults: 2, bags: 'none', nightsOneWay: 3, booked: {}, step: 'summary', ground: {},
  flight: { out: leg('PRG', 'JFK', '2030-03-20', '10:00', '13:30', 'Europe/Prague', 'America/New_York'), back: leg('JFK', 'PRG', '2030-03-27', '18:00', '23:59', 'America/New_York', 'Europe/Prague'), flightCzk: 12000, groundCzk: 0, bagCzk: 0 },
  dest: { label: 'New York', country: 'Spojené státy americké', cc: 'US', lat: 40.7, lon: -74 },
  stay: { mode: 'manual', name: 'Hotel', totalCzk: 20000 }, car: null, plan: null,
});

test('průvodce cestou: shrnutí má „🛂 Před cestou“ a vstupní poplatky jako zvláštní řádek pod součtem', () => {
  const c = load({ withTrip: true });
  const host = { innerHTML: '' }, root = { innerHTML: '' };
  vm.runInContext('var $ = (s) => (s === "#tripRoot" ? __root : s === "#tripStep" ? __host : {}); var $$ = () => []; var go = () => {}; var toast = () => {}; var save = () => {};', c);
  c.__root = root; c.__host = host;
  c.S.trip = usTrip();
  c.window.Trip.render();
  const h = sp(host.innerHTML);
  assert.match(h, /<h3>🛂 Před cestou<\/h3>/);
  assert.match(h, /<td>Celkem<\/td><td>44 000 Kč<\/td>/, 'součet cesty beze změny');
  assert.match(h, /<tr class="entry-fee"><td>🛂<\/td><td>ESTA \(USA\) · 2 × ~36 € <span class="faint">– vstupní poplatek, orientačně<\/span><\/td><td>\+ 1 800 Kč<\/td><\/tr>/);
  assert.match(h, /<td>Celkem i se vstupními poplatky<\/td><td>45 800 Kč<\/td>/);
  assert.equal(c.window.Trip.costs(c.S.trip).total, 44000, 'poplatky nejsou v ceně cesty (plánovač, hlavička)');
  // bez registrace (Německo): žádný řádek navíc
  c.S.trip = { ...usTrip(), dest: { label: 'Berlín', country: 'Německo', cc: 'DE' } };
  c.window.Trip.render();
  assert.doesNotMatch(host.innerHTML, /entry-fee|Celkem i se/);
  assert.match(host.innerHTML, /🪪 Stačí občanský průkaz/);
  // Cancún s přestupem v New Yorku: ESTA v „Před cestou“, poplatek i připomínka (cíl Mexiko registraci nechce)
  const mx = { ...usTrip(), dest: { label: 'Cancún', country: 'Mexiko', cc: 'MX' } };
  mx.flight = { ...mx.flight, out: { ...mx.flight.out, to: 'CUN', stops: 1, layovers: [{ at: 'JFK', min: 150, cc: 'US' }] }, back: { ...mx.flight.back, from: 'CUN', stops: 1, layovers: [{ at: 'LHR', min: 120, cc: 'GB' }] } };
  c.S.trip = mx;
  c.window.Trip.render();
  const m = sp(host.innerHTML);
  assert.match(m, /<b>Spojené státy americké<\/b> <span class="faint">– jen přestup<\/span>/);
  assert.match(m, /<td>ESTA \(USA, přestup\) · 2 × ~36 € <span class="faint">– vstupní poplatek, orientačně<\/span><\/td><td>\+ 1 800 Kč<\/td>/);
  assert.match(m, /– jen přestup<\/span> <span class="ec ec-reg">🛂 ETA<\/span>/, 'Británie s podmínkou, bez poplatku');
  assert.equal((m.match(/entry-fee/g) || []).length, 1);
  assert.deepEqual(plain(c.window.Trip.tripVia(mx)), ['US', 'GB']);
  assert.deepEqual(plain(c.window.Trip.calendarEvents(mx)).filter((e) => e.title.startsWith('🛂')).map((e) => [e.title, e.start]), [['🛂 Vyřídit ESTA (USA – přestup)', '2030-03-06']]);
});

test('průvodce cestou: země cesty (cíl, místa trasy, víc měst) a připomínka v kalendáři', () => {
  const c = load({ withTrip: true });
  const { Trip } = c.window;
  assert.deepEqual(plain(Trip.tripCountries(usTrip())), ['US']);
  assert.deepEqual(plain(Trip.tripCountries({ ...usTrip(), ccs: ['US', 'CA', 'CZ', 'x'] })), ['US', 'CA']);
  const ev = plain(Trip.calendarEvents(usTrip()));
  const rem = ev.filter((e) => e.title.startsWith('🛂'));
  assert.deepEqual(rem.map((e) => [e.title, e.start]), [['🛂 Vyřídit ESTA (USA)', '2030-03-06']]);
  const de = plain(Trip.calendarEvents({ ...usTrip(), dest: { label: 'Berlín', cc: 'DE' } }));
  assert.equal(de.filter((e) => e.title.startsWith('🛂')).length, 0);
  // sdílený odkaz: jen platné kódy zemí
  const t = Trip.sanitizeTrip(JSON.parse(JSON.stringify({ ...usTrip(), ccs: ['US', '<b>', 'CA', 'US'] })));
  assert.deepEqual(plain(t.ccs), ['US', 'CA']);
});

test('plánovač: sdílený plán (#plan=) nese jen kódy zemí, ne vstupní data', () => {
  const ctx2 = { window: {}, TextEncoder, TextDecoder, btoa, atob };
  vm.createContext(ctx2);
  vm.runInContext(read('public/js/planshare.js'), ctx2);
  const { PlanShare } = ctx2.window;
  const plan = { name: 'Amerika', dest: 'New York, Toronto', iso: null, isos: ['US', 'CA', 'bad', 'US'], start: '2030-03-20', end: '2030-03-30', pax: '2', days: {}, checklist: [], notes: '' };
  const back = PlanShare.decode(PlanShare.encode(plan));
  assert.deepEqual(plain(back.isos), ['US', 'CA']);
  assert.equal(back.iso, null);
  assert.ok(!('isos' in PlanShare.sanitize({ ...plan, isos: undefined })));
  assert.ok(PlanShare.encode(plan).length < 400, 'krátký odkaz');
  // přestupy s registrací (via) jen jako kódy
  const v = PlanShare.decode(PlanShare.encode({ ...plan, isos: undefined, iso: 'MX', via: ['US', 'x', 'US', 'GB'] }));
  assert.deepEqual(plain(v.via), ['US', 'GB']);
  assert.ok(!('via' in PlanShare.sanitize(plan)));
});

test('countries.json: hlavní města i česky (capCs, jen když se liší), anglický název zůstává pro odkazy', () => {
  const by = Object.fromEntries(COUNTRIES.map((c) => [c.iso2, c]));
  assert.deepEqual(['CZ', 'AT', 'PT', 'IT', 'CN', 'MX'].map((cc) => by[cc].capCs), ['Praha', 'Vídeň', 'Lisabon', 'Řím', 'Peking', 'Mexiko']);
  assert.equal(by.CZ.cap, 'Prague');
  assert.equal(by.SK.capCs, undefined, 'Bratislava je stejně');
  for (const c of COUNTRIES) if ('capCs' in c) assert.ok(typeof c.capCs === 'string' && c.capCs && c.capCs !== c.cap, c.iso2);
});

test('režim s datem konce: po validUntil čip „ověř vstup“ místo „bez víza“ (over)', () => {
  const r = { validUntil: '2026-12-31' };
  assert.equal(Entry.over(r, '2026-12-31'), false);
  assert.equal(Entry.over(r, '2027-01-01'), true);
  assert.equal(Entry.over({}, '2030-01-01'), false);
});
