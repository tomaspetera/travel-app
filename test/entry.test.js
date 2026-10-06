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
const KEYS = ['iso2', 'visa', 'idCard', 'maxStayDays', 'etaName', 'etaCostEur', 'etaUrl', 'transitEta', 'passportValidity', 'vaccinesRequired', 'vaccinesRecommended', 'notes', 'source', 'verified'];
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
  }
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
      assert.equal(r.transitEta, true, at);
      assert.equal(r.visa, 'eta', `${at}: tranzit jen u registrace`);
      assert.match(r.notes, /tranzit/i, `${at}: tranzit musí být v poznámce`);
    }
  }
  assert.deepEqual(ENTRY.countries.filter((r) => r.transitEta).map((r) => r.iso2).sort(), ['CA', 'US']);
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

  assert.match(Entry.cardChip('US'), /^<span class="ec ec-reg" title="[^"<>]*">🛂 ESTA<\/span>$/);
  assert.match(Entry.cardChip('DE'), />🪪 stačí OP</);
  assert.match(Entry.cardChip('TH'), />bez víza</);
  assert.equal(Entry.cardChip('CZ'), '', 'domov bez čipu');
  assert.equal(Entry.cardChip('XX'), '');
  assert.match(Entry.cardChip('US'), /title="Spojené státy americké: Bez víza, ale nutná online registrace předem \(ESTA\) – ~36 € \(≈ 900 Kč\)\. Pobyt: 90 dní\./);
});

test('čip u letu jen když je co vyřizovat; cena v €, „zdarma“, escapování textů z dat', () => {
  assert.match(Entry.flightChip('US'), />🛂 ESTA 36 €<\/span>$/);
  assert.match(Entry.flightChip('GB'), />🛂 ETA 23 €</);
  assert.match(Entry.flightChip('LK'), />🛂 ETA zdarma</);
  assert.match(Entry.flightChip('IN'), />🛂 e-vízum 22 €</);
  assert.match(Entry.flightChip('EG'), />🛂 vízum na hranici</);
  assert.match(Entry.flightChip('CN'), />📄 vízum předem</);
  for (const iso of ['DE', 'AL', 'TH', 'TR', 'CZ', '', null, 'XX']) assert.equal(Entry.flightChip(iso), '', String(iso));
  assert.match(Entry.idNote('AL'), /🪪 stačí OP/);
  assert.equal(Entry.idNote('US'), '');
  assert.equal(Entry.idNote('CZ'), '');

  const evil = load();
  const data = JSON.parse(JSON.stringify(ENTRY));
  Object.assign(data.countries.find((r) => r.iso2 === 'US'), { etaName: '<img src=x onerror=alert(1)>', notes: '"><script>alert(1)</script>', etaUrl: 'javascript:alert(1)' });
  evil.window.Entry.set(data);
  for (const html of [evil.window.Entry.flightChip('US'), evil.window.Entry.cardChip('US'), evil.window.Entry.detailHtml('US'), evil.window.Entry.checklistHtml(['US'], { ret: '2027-01-10' })]) {
    assert.ok(!/<img|<script|javascript:/i.test(html), html.slice(0, 200));
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
  assert.equal(Entry.transit([via(['LHR', 'GB'], ['IST', 'TR'], ['DXB', 'AE'])], 'TH').length, 0, 'jen země s transitEta');
  assert.equal(Entry.transit([{ stops: 0 }, null, { layovers: [{ at: 'JFK', min: 90 }] }], 'MX').length, 0, 'bez země přestupu nic');
  const html = Entry.transitHtml([via(['JFK', 'US'])], 'MX');
  assert.match(html, /^<span class="b hot ec-warn" title="JFK: Spojené státy americké vyžaduje ESTA i při přestupu na letišti[^"]*">✈︎ přestup v USA – i tranzit vyžaduje ESTA<\/span>$/);
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
  assert.equal(Entry.passportUntil('3 měsíce po plánovaném odjezdu (doporučeno 6 měsíců)', '2026-12-14'), '2027-06-14', 'přísnější lhůta');
  assert.equal(Entry.passportUntil('biometrický pas min. 6 měsíců (180 dnů) od data vstupu', '2026-12-14'), '2027-06-14');
  assert.equal(Entry.passportUntil('po dobu pobytu', '2026-12-14'), null);
  assert.equal(Entry.passportUntil('stačí platný OP nebo pas', '2026-12-14'), null);
  assert.equal(Entry.passportUntil('6 měsíců po vstupu', null), null);
  assert.equal(Entry.passportUntil('6 měsíců po vstupu', '2026-13-01'), null);
  assert.deepEqual(plain(Entry.passportRule('6 měsíců po vstupu, 2 volné stránky')), { months: 6, days: 0 }, 'stránky nejsou lhůta');
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
  assert.match(Entry.reminder('IN', '2026-12-20', '2026-10-06').description, /aspoň s 4 dny/);
  assert.equal(Entry.reminder('CN', '2026-12-20', '2026-10-06').start, '2026-11-20');
  assert.equal(Entry.reminder('CN', '2026-12-20', '2026-10-06').title, '🛂 Vyřídit vízum (Čína)');
  assert.equal(Entry.reminder('GN', '2026-12-20', '2026-10-06').start, '2026-10-29');
  for (const iso of ['DE', 'TH', 'AL', 'EG', 'CZ', 'XX']) assert.equal(Entry.reminder(iso, '2026-12-20', '2026-10-06'), null, iso);
  assert.equal(Entry.reminder('US', '2026-10-10', '2026-10-06').start, '2026-10-06', 'na 14 dní předem už je pozdě → dnes');
  assert.equal(Entry.reminder('US', '2026-10-06', '2026-10-06'), null, 'v den odletu už ne');
  assert.equal(Entry.reminder('US', 'zítra', '2026-10-06'), null);

  const ics = Ics.build([r], { now: Date.UTC(2026, 9, 6) }).replace(/\r\n /g, '');
  assert.match(ics, /\r\nSUMMARY:🛂 Vyřídit ESTA \(USA\)\r\n/);
  assert.match(ics, /\r\nDTSTART;VALUE=DATE:20261206\r\n/);
  assert.match(ics, /\r\nURL:https:\/\/esta\.cbp\.dhs\.gov\/\r\n/);
});

/* ---------- před cestou ---------- */
test('„Před cestou“: doklady s datem platnosti pasu, registrace s cenou a odkazem, očkování; Česko a duplicity pryč', () => {
  const items = Entry.checklist(['TH', 'CZ', 'TH', 'AL', 'US', 'XX'], { ret: '2026-12-14' });
  assert.deepEqual(plain(items.map((x) => x.iso)), ['TH', 'AL', 'US']);
  assert.equal(items[0].docs, '🛂 Cestovní pas platný aspoň do 14. 6. 2027 – občanský průkaz nestačí');
  assert.equal(items[1].docs, '🪪 Stačí platný občanský průkaz (nebo pas) – platný aspoň do 14. 3. 2027');
  assert.equal(items[2].docs, '🛂 Cestovní pas – občanský průkaz nestačí', 'USA: platnost po dobu pobytu');
  assert.equal(Entry.checklist(['DE'], {})[0].docs, '🪪 Stačí platný občanský průkaz (nebo pas)');

  const html = sp(Entry.checklistHtml(['US', 'TH'], { ret: '2026-12-14', pax: 2 }));
  assert.match(html, /<h3>🛂 Před cestou<\/h3>/);
  assert.match(html, /Bez víza, ale nutná online registrace předem \(ESTA\)<\/b> · ~36 € \(≈ 900 Kč\) na osobu \(2 os\. ≈ 1 800 Kč\)/);
  assert.match(html, /<a href="https:\/\/esta\.cbp\.dhs\.gov\/" target="_blank" rel="noopener">oficiální web ↗<\/a>/);
  assert.match(html, /platí i při přestupu/);
  assert.match(html, /💉 Povinné očkování: žlutá zimnice při příletu z rizikové země/);
  assert.match(html, /aspoň do 14\. 6\. 2027/);
  assert.match(html, /před cestou vždy ověř aktuální podmínky na <a href="https:\/\/www\.mzv\.gov\.cz\/jnp\/cz\/cestujeme\/index\.html"/);
  assert.equal(Entry.checklistHtml(['CZ'], {}), '');
  assert.equal(Entry.checklistHtml([], {}), '');
});

test('vstupní poplatky: na osobu × cestující v Kč, jen kde se platí (zdarma a bez víza ne)', () => {
  assert.deepEqual(plain(Entry.costs(['US', 'DE', 'LK', 'AU', 'TH'], 2)), [{ iso: 'US', label: 'ESTA (USA) · 2 × ~36 €', eur: 72, czk: 1800 }]);
  assert.deepEqual(plain(Entry.costs(['EG'], 1)), [{ iso: 'EG', label: 'e-Visa (Egypt) · 1 × ~27 €', eur: 27, czk: 680 }]);
  assert.deepEqual(plain(Entry.costs(['CN'], 3)), [], 'vízum bez udané ceny');
  assert.equal(Entry.costs(['US', 'CA'], 1).length, 2);
});

test('detail země: režim česky, pobyt, doklad, platnost pasu, cena v € a Kč, zdroj a upozornění', () => {
  const us = sp(Entry.detailHtml('US'));
  assert.match(us, /<h3>🛂 Vstup pro občany ČR<\/h3>/);
  assert.match(us, /Bez víza, ale nutná online registrace předem \(ESTA\)/);
  assert.match(us, /ESTA · <b>~36 € \(≈ 900 Kč\)<\/b> na osobu/);
  assert.match(us, /Nutná i při přestupu/);
  assert.match(us, />🛂 jen pas</);
  assert.match(us, />90 dní</);
  assert.match(us, /Zdroj: MZV ČR \(ověřeno 10\/2026\)/);
  assert.match(Entry.detailHtml('DE'), /EU \/ Schengen – volný pohyb, stačí občanský průkaz/);
  assert.match(Entry.detailHtml('DE'), /bez omezení \(EU\)/);
  assert.match(Entry.detailHtml('TH'), /Bez víza – jen s cestovním pasem/);
  assert.match(Entry.detailHtml('EG'), /Vízum při příletu na hranici, nebo předem online \(e-Visa\)/);
  assert.match(Entry.detailHtml('CN'), /Vízum předem na zastupitelském úřadě/);
  assert.match(Entry.detailHtml('AL'), />🪪 stačí OP</);
  assert.match(Entry.detailHtml('SY'), /neověřeno na oficiální stránce/);
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
  assert.match(host.innerHTML, /🪪 Stačí platný občanský průkaz/);
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
});
