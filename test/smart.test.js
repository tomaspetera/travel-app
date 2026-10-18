// ✨ Chytré hledání (public/js/smart.js): české věty → nastavení hledání letů, místa z vět s koncovkami.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const c = { window: {}, console };
vm.createContext(c);
vm.runInContext(readFileSync(new URL('../public/js/searchhelp.js', import.meta.url), 'utf8'), c);
vm.runInContext(readFileSync(new URL('../public/js/smart.js', import.meta.url), 'utf8'), c);
const { Smart, SearchHelp: H } = c.window;
const today = '2026-10-18'; // neděle
const presets = { weekend: { nMin: 1, nMax: 3, out: [4, 5, 6], back: [0, 1] }, long: { nMin: 3, nMax: 5, out: [3, 4, 5], back: [0, 1, 2] }, week: { nMin: 5, nMax: 9, out: [], back: [] }, '2weeks': { nMin: 11, nMax: 16, out: [], back: [] } };
const P = (q, t = today) => JSON.parse(JSON.stringify(Smart.parse(q, { today: t, presets, holidays: H.holidayList(t), holidayDates: H.holidayDates })));
const chips = (r) => r.chips.map((x) => x.text);

test('k moři v květnu do 5000 na týden: regiony u moře podle měsíce, termín, délka a cena', () => {
  const r = P('k moři v květnu do 5000 na týden');
  assert.deepEqual(chips(r), ['k moři', 'květen', 'týden', 'do 5 000 Kč']);
  assert.deepEqual(r.items.map((x) => x.id), ['rg:kreta', 'rg:kypr', 'rg:turecka-riviera', 'rg:baleary']);
  assert.deepEqual(r.patch, { maxPrice: '5000', len: 'week', nMin: 5, nMax: 9, outDays: [], backDays: [], dateMode: 'flex', dFrom: '2027-05-01', dTo: '2027-05-31' });
  assert.deepEqual(r.to, []);
  // v zimě k moři tam, kde je teplo i v zimě
  assert.deepEqual(P('u moře v lednu').items.map((x) => x.id), ['rg:kanary', 'rg:egypt-more', 'rg:madeira']);
  // bez diakritiky stejně
  assert.deepEqual(chips(P('k mori v kvetnu do 5 000 kc')), ['k moři', 'květen', 'do 5 000 Kč']);
});

test('místa ve větě: odkud (z …) a kam, víc míst, jméno moře je místo', () => {
  const r = P('z Vídně do Barcelony 12. 11. - 16. 11.');
  assert.deepEqual([r.from, r.to], [['Vídně'], ['Barcelony']]);
  assert.deepEqual([r.patch.dateMode, r.patch.xOut, r.patch.xBack], ['exact', '2026-11-12', '2026-11-16']);
  assert.deepEqual(P('Itálie a Řecko v létě, přímý let, s kufrem').to, ['Itálie', 'Řecko']);
  const rm = P('Rudé moře o Vánocích');
  assert.deepEqual(rm.to, ['Rudé moře']);
  assert.equal(rm.kind, null, '„moře“ v Rudé moře není „k moři“');
  assert.equal(rm.patch.len, 'holiday');
  assert.equal(P('Baltimore').kind, null);
  assert.deepEqual(P('Baltimore').chips, []);
});

test('termíny: víkendy, svátky, měsíce, roční období, relativně, konkrétní dny', () => {
  const w = P('Londýn tento víkend');
  assert.deepEqual([w.patch.len, w.patch.dFrom, w.patch.dTo, w.patch.outDays], ['weekend', '2026-10-18', '2026-10-24', [4, 5, 6]]);
  assert.deepEqual([P('příští měsíc').patch.dFrom, P('příští měsíc').patch.dTo], ['2026-11-01', '2026-11-30']);
  assert.deepEqual([P('v létě').patch.dFrom, P('v létě').patch.dTo], ['2027-06-01', '2027-08-31']);
  assert.deepEqual([P('na podzim').patch.dFrom, P('na podzim').patch.dTo], ['2026-10-18', '2026-11-30'], 'podzim už běží – od dneška');
  assert.deepEqual([P('v zimě').patch.dFrom, P('v zimě').patch.dTo], ['2026-12-01', '2027-02-28']);
  const d = P('od 3.–10. 6.');
  assert.deepEqual([d.patch.xOut, d.patch.xBack], ['2027-06-03', '2027-06-10']);
  const one = P('15. 5. na 4 noci do Madridu');
  assert.deepEqual([one.patch.xOut, one.patch.xBack, one.to], ['2027-05-15', '2027-05-19', ['Madridu']]);
  const ow = P('Paříž 15.5. jen tam');
  assert.deepEqual([ow.patch.trip, ow.patch.xOut, ow.patch.xBack], ['oneway', '2027-05-15', undefined]);
  assert.deepEqual([P('co nejdřív').patch.dFrom, P('co nejdřív').patch.dTo], ['2026-10-18', '2026-11-01']);
});

test('délka, lidé, cena, zavazadla, přímé lety, druh cíle', () => {
  assert.deepEqual(P('na 5 nocí').patch.nMin, 5);
  assert.deepEqual([P('na 3 dny').patch.nMin, P('na 3 dny').patch.nMax], [2, 2]);
  assert.equal(P('na 2 týdny').patch.len, '2weeks');
  assert.equal(P('prodloužený víkend').patch.len, 'long');
  assert.equal(P('ve dvou').patch.adults, 2);
  assert.equal(P('pro 3 lidi').patch.adults, 3);
  assert.equal(P('s přítelkyní').patch.adults, 2);
  assert.equal(P('do 8 tisíc').patch.maxPrice, '8000');
  assert.equal(P('za 3 dny').patch.maxPrice, undefined, '„za 3 dny“ není cena');
  assert.equal(P('do 5000 2 lidi').patch.maxPrice, '5000');
  assert.equal(P('s kabinovým kufrem').patch.bags, 'cabin');
  assert.equal(P('s kufrem').patch.bags, 'checked');
  assert.equal(P('bez přestupu').patch.directOnly, true);
  assert.equal(P('za teplem').patch.minTemp, 20);
  assert.equal(P('do horka').patch.minTemp, 25);
  assert.deepEqual(P('exotika').items.map((x) => x.id), ['cc:TH', 'cc:ID', 'cc:VN', 'cc:AE', 'cc:LK']);
  assert.deepEqual(P('na hory').items.map((x) => x.id), ['ap:INN', 'ap:SZG', 'ap:GVA', 'ap:TRN']);
  assert.equal(P('kamkoliv').kind, 'any');
  // děti platí letenku: dospělí + děti; bez počtu dospělých dva
  assert.equal(P('2 dospělí a 2 děti k moři').patch.adults, 4);
  assert.equal(P('s dítětem do Říma').patch.adults, 3);
  assert.equal(P('na jih').patch.minTemp, 20);
});

test('za týden / za 14 dní = kdy odletět (ne délka pobytu)', () => {
  const w = P('za týden někam');
  assert.deepEqual([w.patch.dFrom, w.patch.dTo, w.patch.len], ['2026-10-22', '2026-10-29', undefined]);
  const d = P('za 14 dní do Londýna na 3 noci');
  assert.deepEqual([d.patch.dFrom, d.patch.dTo, d.patch.nMin, d.to], ['2026-10-29', '2026-11-05', 3, ['Londýna']]);
});

test('místa s koncovkami: tvary slova a nejlepší návrh (země a oblasti před náhodnými místy)', () => {
  assert.deepEqual([...Smart.stems('Vídně')], ['Vídně', 'Vídn', 'Víd']);
  assert.deepEqual([...Smart.stems('Ří')], ['Ří']);
  const best = (list) => Smart.bestPlace(list)?.id;
  assert.equal(best([
    { q: 'Vídně', items: [{ id: 'geo:42.8,18.4|Vidne', label: 'Vidne', type: 'place' }] },
    { q: 'Vídn', items: [{ id: 'geo:55.5,37.7|Vidnoye', label: 'Vidnoye', type: 'city' }] },
    { q: 'Víd', items: [{ id: 'ap:VIE', label: 'Vídeň', type: 'airport' }, { id: 'geo:48.2,16.3|Vídeň', label: 'Vídeň', type: 'city' }] },
  ]), 'ap:VIE');
  assert.equal(best([{ q: 'Itálie', items: [{ id: 'geo:42.8,12.8|Itálie', label: 'Itálie', type: 'city' }, { id: 'cc:IT', label: 'Itálie', type: 'country' }] }]), 'cc:IT');
  assert.equal(best([{ q: 'Říma', items: [{ id: 'ap:RMT', label: 'Rimatara', type: 'airport' }] }, { q: 'Řím', items: [{ id: 'metro:ROM', label: 'Řím', type: 'metro' }] }]), 'metro:ROM');
  assert.equal(best([{ q: 'Rudé moře', items: [{ id: 'rg:egypt-more', label: 'Rudé moře (Egypt)', type: 'region' }] }]), 'rg:egypt-more');
  assert.equal(best([{ q: 'xyz', items: [{ id: 'ap:AAA', label: 'Abc', type: 'airport' }] }]), undefined);
});

test('Objevuj: věta → místo, druh plánu, dny, km, od kdy, zájmy; základní tvar jména místa', () => {
  const X = (q) => JSON.parse(JSON.stringify(Smart.parseExplore(q, { today })));
  assert.deepEqual(X('Lisabon na 3 dny'), { place: 'Lisabon', mode: null, days: 3, km: null, start: null, interests: [], chips: ['📅 3 dny'] });
  assert.deepEqual([X('výlety z Brna').place, X('výlety z Brna').mode], ['Brna', 'day']);
  assert.deepEqual([X('Krakov pěšky 10 km').mode, X('Krakov pěšky 10 km').km], ['hike', 10]);
  assert.deepEqual([X('na kole kolem Vídně 40 km').mode, X('na kole kolem Vídně 40 km').place], ['bike', 'Vídně'], '„kolem“ = okolo, ne na kole');
  assert.deepEqual([X('okruh po Toskánsku na týden').mode, X('okruh po Toskánsku na týden').days, X('okruh po Toskánsku na týden').place], ['loop', 7, 'Toskánsku']);
  assert.deepEqual([X('Řím s dětmi od 15. 5.').start, X('Řím s dětmi od 15. 5.').interests], ['2027-05-15', ['kids']]);
  assert.deepEqual(X('Praha').chips, []);
  const N = (p) => [...Smart.nominatives(p)];
  assert.ok(N('Brna').includes('Brno'));
  assert.ok(N('Prahy').includes('Praha'));
  assert.ok(N('Vídně').includes('Vídeň'));
  assert.ok(N('Lisabonu').includes('Lisabon'));
  assert.ok(N('Krétu').includes('Kréta'));
  assert.ok(N('Toskánsku').includes('Toskánsko'));
  assert.ok(N('Brně').includes('Brno'));
  assert.equal(N('Lisabon')[0], 'Lisabon', 'původní tvar první');
});

test('ukázkové věty na Přehledu (podle ročního období) se rozumí celé – nic nezbyde jako cíl', () => {
  for (const [q, kind] of [['na hory v lednu na lyže', 'mountains'], ['na hory v červenci na týden', 'mountains'], ['za teplem v prosinci na týden', 'warm'], ['k moři v srpnu do 5000', 'sea']]) {
    const r = P(q);
    assert.equal(r.kind, kind, q);
    assert.deepEqual(r.to || [], [], q);
    assert.ok(r.patch.dFrom, q);
  }
});
