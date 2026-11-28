// 🔗 Odkaz /#hledat=[ODKUD]-[KAM][-KDY] (budoucí veřejné stránky zemí a měsíců): jen vyplní formulář Letů, hledání
// (drahé /api/search) nikdy nespustí – odkaz otevře i robot Googlu, který spouští JS. Parser SearchHelp.hledatFromHash
// přes node:vm, obsluha openHledatFromHash z app.js se stuby a statická kontrola Flights.prefill a zapojení.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (f) => readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');
const plain = (v) => JSON.parse(JSON.stringify(v)); // objekty z jiného vm kontextu
// recs.js je v index.html před searchhelp.js (měsíc → Recs.monthRange) – tady ve stejném kontextu
const ctx = { window: {} };
vm.createContext(ctx);
for (const f of ['recs.js', 'searchhelp.js']) vm.runInContext(read(f), ctx);
const H = ctx.window.SearchHelp;
const TODAY = '2026-11-28';
const P = (h, today = TODAY) => plain(H.hledatFromHash(h, today));

test('hledatFromHash: odkud, kam (letiště i země) a přesný termín tam i zpět', () => {
  assert.deepEqual(P('#hledat=PRG-BCN-2027-01-10-2027-01-17'), { from: 'PRG', to: 'BCN', dates: { xOut: '2027-01-10', xBack: '2027-01-17' } });
  assert.deepEqual(P('#hledat=PRG-IT-2027-01-10'), { from: 'PRG', to: 'IT', dates: { xOut: '2027-01-10' } });
  // prázdné odkud (minulé hledání / domov), prázdné kam (Kamkoliv), bez termínu (výchozí)
  assert.deepEqual(P('#hledat=-IT'), { from: '', to: 'IT', dates: {} });
  assert.deepEqual(P('#hledat=PRG-'), { from: 'PRG', to: '', dates: {} });
  assert.deepEqual(P('#hledat=-'), { from: '', to: '', dates: {} });
  assert.deepEqual(P('#hledat=--2027-01-10'), { from: '', to: '', dates: { xOut: '2027-01-10' } });
});

test('hledatFromHash: měsíc MM → nejbližší takový měsíc jako rozmezí (Recs.monthRange)', () => {
  assert.deepEqual(P('#hledat=-IT-03'), { from: '', to: 'IT', dates: { dFrom: '2027-03-01', dTo: '2027-03-31' } });
  assert.deepEqual(P('#hledat=PRG--12'), { from: 'PRG', to: '', dates: { dFrom: '2026-12-01', dTo: '2026-12-31' } });
  // běžící měsíc od zítřka; z listopadu zbývají 2 dny → výchozí termín, ne listopad za rok
  assert.deepEqual(P('#hledat=-IT-12', '2026-12-10').dates, { dFrom: '2026-12-11', dTo: '2026-12-31' });
  assert.deepEqual(P('#hledat=-IT-11').dates, {});
  const r = plain(ctx.window.Recs.monthRange(7, TODAY));
  assert.deepEqual(P('#hledat=-ES-07').dates, r);
  // měsíc mimo 01–12 je chybný odkaz
  assert.equal(H.hledatFromHash('#hledat=-IT-00', TODAY), null);
  assert.equal(H.hledatFromHash('#hledat=-IT-13', TODAY), null);
});

test('hledatFromHash: termín mimo meze serveru se zahodí jako v searchTo', () => {
  // odlet ode dneška nejvýš +359 dní
  assert.deepEqual(P('#hledat=PRG-BCN-2026-11-28').dates, { xOut: '2026-11-28' });
  assert.deepEqual(P('#hledat=PRG-BCN-2026-11-27').dates, {}, 'včera');
  assert.deepEqual(P('#hledat=PRG-BCN-2026-11-27-2026-12-03').dates, {}, 'prošlý odlet i s návratem');
  assert.deepEqual(P('#hledat=PRG-BCN-2027-11-22').dates, { xOut: '2027-11-22' }, '+359');
  assert.deepEqual(P('#hledat=PRG-BCN-2027-11-23').dates, {}, '+360');
  // návrat nejvýš 45 nocí, jinak jen tam; návrat před odletem → jen tam
  assert.deepEqual(P('#hledat=PRG-BCN-2027-01-01-2027-02-15').dates, { xOut: '2027-01-01', xBack: '2027-02-15' });
  assert.deepEqual(P('#hledat=PRG-BCN-2027-01-01-2027-02-16').dates, { xOut: '2027-01-01' });
  assert.deepEqual(P('#hledat=PRG-BCN-2027-01-10-2027-01-05').dates, { xOut: '2027-01-10' });
});

test('hledatFromHash: cokoli mimo striktní gramatiku → null', () => {
  for (const h of [
    '', null, undefined, '#hledat=', '#hledat', 'hledat=PRG-BCN', '#flights', '#hledat=prg-bcn', '#hledat=PRG-bcn', '#hledat=Prg-BCN',
    '#hledat=PRAG-BCN', '#hledat=PR-BCN', '#hledat=PRG-B', '#hledat=PRG-BCNX', '#hledat=PRG', '#hledat=-11', '#hledat=PRG-BCN-3',
    '#hledat=PRG-BCN-2027-1-10', '#hledat=PRG-BCN-2027-01-10-x', '#hledat=PRG-BCN-03-04', '#hledat=PRG-BCN-2027-01-10-2027-01-17-2027-01-20',
    '#hledat=PRG-BCN-2027-02-30', '#hledat=PRG-BCN-2027-01-10-2027-13-01', '#hledat=<script>alert(1)</script>', '#hledat=PRG-<b>-03',
    '#hledat=PRG-BCN%2D03', '#hledat=PRG-BCN-03 ', ' #hledat=PRG-BCN', '#hledat=PRG-BCN-03\n', '#hledat=PRG-BCN&run=1', '#hledat=PRG-BCN?x',
  ]) assert.equal(H.hledatFromHash(h, TODAY), null, JSON.stringify(h));
});

// tělo funkce na nejvyšší úrovni (app.js) / ve IIFE (flights.js, odsazení 2 mezery)
const fnBody = (src, name, ind = '') => { const i = src.indexOf(`function ${name}(`); assert.ok(i >= 0, name); return src.slice(i, src.indexOf(`\n${ind}}\n`, i) + ind.length + 2); };
const APP = read('app.js'), FL = read('flights.js');

test('openHledatFromHash: Lety s vyplněným formulářem, adresa #flights a žádné hledání ani dotaz na síť', () => {
  const boom = (n) => () => { throw new Error(`zakázané volání ${n}`); };
  const run = (hash, { search = H } = {}) => {
    const calls = { go: [], prefill: [], replace: [] };
    const c = {
      location: { hash },
      history: { replaceState: (s, t, u) => { calls.replace.push(u); c.location.hash = u; } },
      go: (v, o) => calls.go.push([v, plain(o)]),
      todayLocal: () => TODAY,
      fetch: boom('fetch'), startSearch: boom('startSearch'), runSearch: boom('runSearch'),
      window: {},
    };
    c.window.SearchHelp = search;
    c.window.Flights = c.Flights = { prefill: (h) => calls.prefill.push(plain(h)), searchTo: boom('Flights.searchTo'), runSearch: boom('Flights.runSearch'), smartRun: boom('Flights.smartRun') };
    c.SearchHelp = search;
    vm.createContext(c);
    vm.runInContext(fnBody(APP, 'openHledatFromHash') + '\nthis.out = openHledatFromHash();', c);
    return { ok: c.out, hash: c.location.hash, calls };
  };
  const r = run('#hledat=PRG-IT-2027-01-10');
  assert.equal(r.ok, true);
  assert.equal(r.hash, '#flights');
  assert.deepEqual(r.calls.replace, ['#flights']);
  assert.deepEqual(r.calls.go, [['flights', { noHash: true }]]);
  assert.deepEqual(r.calls.prefill, [{ from: 'PRG', to: 'IT', dates: { xOut: '2027-01-10' } }]);
  // poškozený odkaz: jen Lety, nic nevyplní; jiná adresa: obsluha ji nechá být
  const bad = run('#hledat=prg-it');
  assert.equal(bad.ok, true);
  assert.equal(bad.hash, '#flights');
  assert.deepEqual(bad.calls.prefill, []);
  const other = run('#offer=abc');
  assert.equal(other.ok, false);
  assert.equal(other.hash, '#offer=abc');
  assert.deepEqual(other.calls.go, []);
});

test('Flights.prefill: vyplní bez hledání, uloží koncept, rozbalí formulář a poradí tlačítko dole', () => {
  const body = fnBody(FL, 'prefill', '  ');
  const form = fnBody(FL, 'formTo', '  ');
  for (const b of [body, form]) {
    assert.doesNotMatch(b, /startSearch\(|runSearch\(|searchTo\(|smartRun\(|fetch\(/);
    assert.doesNotMatch(b, /askFrom\(\s*\)/);
  }
  assert.match(body, /formTo\(/);
  assert.match(body, /draftSoon\(\);[^\n]*\n\s*expandForm\(\);/);
  assert.match(body, /Formulář je předvyplněný – hledání spustíš tlačítkem dole/);
  assert.match(body, /Vyber, odkud letíš/);
  // searchTo dál hledá (sdílí formTo)
  assert.match(fnBody(FL, 'searchTo', '  '), /formTo\(items, opts\);[\s\S]*askFrom\(\);[\s\S]*startSearch\(\);/);
  assert.match(FL, /window\.Flights = \{[^\n]*\bprefill,/);
});

test('openHledatFromHash: zapojený ve start() až po Flights.init() a v hashchange', () => {
  const start = fnBody(APP, 'start');
  const i = start.indexOf('await Flights.init()'), j = start.indexOf('openHledatFromHash()');
  assert.ok(i >= 0 && j > i, 've start() za Flights.init()');
  const hc = APP.slice(APP.indexOf("addEventListener('hashchange'"));
  assert.match(hc.slice(0, hc.indexOf('\n  });')), /if \(openHledatFromHash\(\)\) return;/);
});
