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
  // dny a týdny přibližně (jako 2 týdny), noci přesně
  assert.deepEqual([P('na 10 dní').patch.nMin, P('na 10 dní').patch.nMax], [7, 11]);
  assert.deepEqual([P('na 3 týdny').patch.nMin, P('na 3 týdny').patch.nMax], [18, 24]);
  assert.deepEqual([P('na 15 dní').patch.nMin, P('na 15 dní').patch.nMax], [11, 17]);
  assert.ok(P('na 10 dní').chips.some((c) => c.text === '7–11 nocí'));
  assert.deepEqual([P('na 10 nocí').patch.nMin, P('na 10 nocí').patch.nMax], [10, 10]);
  assert.deepEqual([P('Kréta 5. 6. na 10 dní').patch.xOut, P('Kréta 5. 6. na 10 dní').patch.xBack], ['2027-06-05', '2027-06-14'], 'přesné datum: prostřední délka');
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
  // děti 2–11 let a miminka zvlášť od dospělých (dítě platí sedadlo, miminko na klíně); bez počtu dospělých dva
  const fam = P('2 dospělí a 2 děti k moři').patch;
  assert.deepEqual([fam.adults, fam.children, fam.infants], [2, 2, 0]);
  assert.deepEqual(chips(P('2 dospělí a 2 děti k moři')).filter((x) => /dosp/.test(x)), ['2 dospělí + 2 děti']);
  assert.deepEqual([P('s dítětem do Říma').patch.adults, P('s dítětem do Říma').patch.children], [2, 1]);
  const baby = P('s miminkem do Říma');
  assert.deepEqual([baby.patch.adults, baby.patch.children, baby.patch.infants, baby.to], [2, 0, 1, ['Říma']]);
  assert.deepEqual([P('dva dospělí, dítě a miminko').patch.children, P('dva dospělí, dítě a miminko').patch.infants], [1, 1]);
  // počet v 7. pádě („se dvěma dětmi“): děti, ne místo „dvěma dětmi“
  const two = P('dva dospělí se dvěma dětmi do Barcelony');
  assert.deepEqual([two.patch.adults, two.patch.children, two.patch.infants, two.to], [2, 2, 0, ['Barcelony']]);
  assert.deepEqual([P('s dvěma dětmi do Říma').patch.children, P('s dvěma dětmi do Říma').to], [2, ['Říma']]);
  assert.deepEqual([P('se třemi dětmi k moři').patch.children, P('se třemi dětmi k moři').to], [3, []]);
  assert.deepEqual([P('s jedním dítětem').patch.children, P('s jedním dítětem').to], [1, []]);
  assert.deepEqual([P('se dvěma miminky').patch.infants, P('s jedním miminkem').patch.infants, P('s jedním miminkem').to], [2, 1, []]);
  // „ve dvou“ = dva lidé celkem – děti z minulého hledání pryč
  assert.deepEqual([P('ve dvou').patch.children, P('ve dvou').patch.infants], [0, 0]);
  assert.equal(P('do Říma').patch.children, undefined, 'bez lidí ve větě zůstanou cestující z formuláře');
  // „s dětmi“ bez počtu: hledá se s počtem z formuláře a výsledky připomenou upravit osoby
  assert.equal(P('s dětmi do Londýna na jaře').askPax, true);
  assert.equal(P('2 dospělí a 2 děti k moři').askPax, undefined);
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
  // celé slovo přesně (bez diakritiky) před zkráceným tvarem: „Malaga“ je Málaga, ne Malajsie z „Mala“
  assert.equal(best([
    { q: 'Malaga', items: [{ id: 'ap:AGP', label: 'Málaga', type: 'airport' }] },
    { q: 'Malag', items: [{ id: 'ap:AGP', label: 'Málaga', type: 'airport' }] },
    { q: 'Mala', items: [{ id: 'cc:MY', label: 'Malajsie', type: 'country' }, { id: 'ap:AGP', label: 'Málaga', type: 'airport' }] },
  ]), 'ap:AGP');
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
  // víkend bez data: od soboty nejbližšího víkendu (v neděli už příští), prodloužený od pátku, „příští víkend“ o týden dál
  const V = (q, t = today) => { const r = Smart.parseExplore(q, { today: t }); return [r.place, r.days, r.start]; };
  assert.deepEqual(V('Porto na víkend'), ['Porto', 2, '2026-10-24']);
  assert.deepEqual(V('Porto na víkend', '2026-10-20'), ['Porto', 2, '2026-10-24']);
  assert.deepEqual(V('Porto příští víkend', '2026-10-20'), ['Porto', 2, '2026-10-31']);
  assert.deepEqual(V('Řím na prodloužený víkend', '2026-10-20'), ['Řím', 3, '2026-10-23']);
  assert.deepEqual(V('Řím na prodloužený víkend', '2026-10-24'), ['Řím', 3, '2026-10-24'], 'v sobotu od dneška');
  assert.deepEqual(V('Porto na víkend od 7. 11.', '2026-10-20'), ['Porto', 2, '2026-11-07'], 'datum má přednost');
  assert.ok(Smart.parseExplore('Porto na víkend', { today: '2026-10-20' }).chips.includes('🗓️ od 24. 10.'), Smart.parseExplore('Porto na víkend', { today: '2026-10-20' }).chips.join(','));
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

test('přirozené věty: „s dětmi“, „něco teplého“, „v Alpách“, šipka odkud → kam – nic z toho není cíl', () => {
  const t1 = P('Tenerife s dětmi v únoru');
  assert.deepEqual(t1.to, ['Tenerife']);
  assert.ok(t1.chips.some((c) => /s dětmi/.test(c.text)));
  assert.deepEqual(P('k moři s dětmi v červenci').to, []);
  // s počtem osob bez připomínky
  assert.ok(!P('Split pro 4 s dětmi').chips.some((c) => /s dětmi/.test(c.text)));
  const w = P('něco teplého na Vánoce');
  assert.equal(w.kind, 'warm');
  assert.deepEqual(w.to, []);
  assert.deepEqual(P('kde je teplo v lednu').to, []);
  // Teplice nejsou „teplo“
  assert.deepEqual([P('z Teplic do Londýna').kind, P('z Teplic do Londýna').from], [null, ['Teplic']]);
  assert.deepEqual([P('lyže v Alpách v lednu').kind, P('lyže v Alpách v lednu').to], ['mountains', []]);
  assert.deepEqual([P('Vídeň → Nice v listopadu').from, P('Vídeň → Nice v listopadu').to], [['Vídeň'], ['Nice']]);
  assert.deepEqual([P('Praha -> Řím -> Barcelona').from, P('Praha -> Řím -> Barcelona').to], [['Praha'], ['Řím', 'Barcelona']]);
});

test('termín slovy: „20. listopadu“, „od 3. do 7. prosince“, začátek/polovina/konec měsíce, „v pátek“', () => {
  const a = P('do Neapole 20. listopadu');
  assert.deepEqual([a.to, a.patch.dateMode, a.patch.xOut], [['Neapole'], 'exact', '2026-11-20']);
  const b = P('Milán od 3. do 7. prosince');
  assert.deepEqual([b.patch.xOut, b.patch.xBack], ['2026-12-03', '2026-12-07']);
  assert.deepEqual([P('3.–7. prosince Vídeň').patch.xOut, P('3.–7. prosince Vídeň').to], ['2026-12-03', ['Vídeň']]);
  const c = P('Malaga konec listopadu');
  assert.deepEqual([c.to, c.patch.dFrom, c.patch.dTo], [['Malaga'], '2026-11-20', '2026-11-30']);
  assert.deepEqual([P('Kodaň začátkem prosince').patch.dFrom, P('Kodaň začátkem prosince').patch.dTo], ['2026-12-01', '2026-12-10']);
  assert.deepEqual([P('Itálie v polovině listopadu').patch.dFrom, P('Itálie v polovině listopadu').patch.dTo], ['2026-11-10', '2026-11-20']);
  const d = P('Madrid v pátek');
  assert.deepEqual([d.to, d.patch.outDays], [['Madrid'], [5]]);
  assert.deepEqual(P('Turecko all inclusive').to, ['Turecko']);
});

test('nejlepší návrh i podle jiného názvu ze serveru: en („Rome“) a aliases („Toscana“)', () => {
  const best = (list) => Smart.bestPlace(list)?.id;
  assert.equal(best([{ q: 'Rome', items: [{ id: 'metro:ROM', label: 'Řím', en: 'Rome', type: 'metro' }] }]), 'metro:ROM');
  assert.equal(best([{ q: 'Toscana', items: [{ id: 'geo:43.4,11.1|Toskánské ostrovy', label: 'Toskánské ostrovy', type: 'place' }, { id: 'rg:toskansko', label: 'Toskánsko', aliases: ['toskansko', 'toscana'], type: 'region' }] }]), 'rg:toskansko');
});

test('oprava překlepu ze serveru (fuzzy) jen na požádání (typos) – jinak se jako místo z věty nebere', () => {
  const list = [{ q: 'Barcleony', items: [{ id: 'metro:BCN', label: 'Barcelona', type: 'metro', fuzzy: true }] }];
  assert.equal(Smart.bestPlace(list), null);
  assert.equal(Smart.bestPlace(list, true).id, 'metro:BCN');
  // skutečná shoda vyhraje i s typos
  list.push({ q: 'Barcl', items: [{ id: 'geo:1,2|Barclay', label: 'Barclay', type: 'place' }] });
  assert.equal(Smart.bestPlace(list, true).id, 'geo:1,2|Barclay');
});

test('svátky slovy: Velikonoce (i bez seznamu svátků), státní svátek, jarní/podzimní prázdniny, Valentýn', () => {
  const e = (t) => { const r = JSON.parse(JSON.stringify(Smart.parse('Řím o Velikonocích', { today: t }))); return [r.to, r.patch.dFrom, r.patch.dTo, r.patch.len]; };
  // Velikonoční neděle 28. 3. 2027, 16. 4. 2028; odlet čt–pá před ní
  assert.deepEqual(e('2026-10-18'), [['Řím'], '2027-03-25', '2027-03-26', 'long']);
  assert.deepEqual(e('2027-04-10').slice(1, 3), ['2028-04-13', '2028-04-14']);
  // seznam prodloužených víkendů: nejbližší
  assert.equal(P('na státní svátek').chips[0].text, 'Den boje za svobodu');
  assert.deepEqual([P('na jarní prázdniny').patch.dFrom, P('na jarní prázdniny').patch.dTo], ['2027-02-01', '2027-03-20']);
  assert.deepEqual([P('podzimní prázdniny do Londýna').patch.dFrom, P('podzimní prázdniny do Londýna').to], ['2026-10-24', ['Londýna']]);
  assert.deepEqual([P('Paříž na Valentýna').patch.dFrom, P('Paříž na Valentýna').patch.dTo, P('Paříž na Valentýna').to], ['2027-02-12', '2027-02-14', ['Paříž']]);
  // letní prázdniny dál jako léto
  assert.equal(P('o prázdninách k moři').chips.find((c) => c.icon === '📅').text, 'prázdniny');
});

test('víc šipek = cesta přes víc měst (chain): odkud a místa v pořadí; jedna šipka nebo „k moři“ ne', () => {
  const r = P('Praha → Řím → Barcelona → Praha 10. 11. – 17. 11.');
  assert.deepEqual([r.chain, r.from, r.to, r.patch.xOut, r.patch.xBack], [true, ['Praha'], ['Řím', 'Barcelona', 'Praha'], '2026-11-10', '2026-11-17']);
  assert.equal(P('Vídeň → Nice').chain, undefined);
  assert.equal(P('Praha -> Lisabon -> Porto ve dvou').chain, true);
});

test('Objevuj: otázky kolem místa („co vidět v Římě“, „okolí Olomouce“) – místo bez slov otázky', () => {
  const X = (q) => JSON.parse(JSON.stringify(Smart.parseExplore(q, { today })));
  assert.equal(X('co vidět v Římě').place, 'Římě');
  assert.equal(X('Řím co navštívit').place, 'Řím');
  assert.deepEqual([X('co dělat v Londýně s dětmi').place, X('co dělat v Londýně s dětmi').interests], ['Londýně', ['kids']]);
  assert.deepEqual([X('okolí Olomouce').place, X('okolí Olomouce').mode], ['Olomouce', 'day']);
  assert.equal(X('zajímavosti Krakova').place, 'Krakova');
});

test('pomlčka mezi místy = odkud → kam („Praha - Londýn“); bez cíle za ní („Řím – víkend“) je to cíl; data a Baden-Baden ne', () => {
  assert.deepEqual([P('Praha - Londýn').from, P('Praha - Londýn').to], [['Praha'], ['Londýn']]);
  const r = P('Praha–Londýn 3.12.');
  assert.deepEqual([r.from, r.to, r.patch.xOut], [['Praha'], ['Londýn'], '2026-12-03']);
  assert.deepEqual([P('Řím – víkend ve dvou').from, P('Řím – víkend ve dvou').to], [[], ['Řím']]);
  assert.equal(P('Praha - Řím - Barcelona - Praha').chain, true);
  assert.deepEqual(P('Baden-Baden').to, ['Baden-Baden']);
  assert.deepEqual([P('3.–7. 6. Řím').to, P('3.–7. 6. Řím').patch.xBack], [['Řím'], '2027-06-07']);
});

test('dny odletu a návratu slovy („od pátku do neděle“, „čt–ne“) a zavazadla „bez kufru“', () => {
  const r = P('Lisabon od pátku do neděle');
  assert.deepEqual([r.to, r.patch.outDays, r.patch.backDays, r.patch.nMin, r.patch.nMax, r.patch.len], [['Lisabon'], [5], [0], 2, 2, 'custom']);
  assert.deepEqual(chips(r), ['pátek → neděle', '2 noci']);
  assert.deepEqual([P('čt-ne Paříž').patch.outDays, P('čt-ne Paříž').patch.backDays, P('čt-ne Paříž').to], [[4], [0], ['Paříž']]);
  // „po do …“ bez pomlčky není rozsah dnů
  assert.equal(P('z Brna po do Londýna').patch.outDays, undefined);
  assert.deepEqual([P('bez kufru').patch.bags, P('bez kufru').to], ['none', []]);
  assert.equal(P('jen s malým batohem').patch.bags, 'none');
  assert.equal(P('s velkým kufrem').patch.bags, 'checked');
});

test('účel cesty a „levně“ nejsou místa; vánoční trhy = advent', () => {
  assert.deepEqual(P('na svatbu do Milána 5.12.').to, ['Milána']);
  assert.deepEqual(P('Madeira za pár korun').to, ['Madeira']);
  assert.deepEqual(P('za babku do Londýna').to, ['Londýna']);
  assert.deepEqual(P('s batohem do Asie').to, ['Asie']);
  assert.deepEqual(P('co nejlevněji').to, []);
  const t = P('na vánoční trhy do Vídně');
  assert.deepEqual([t.to, t.patch.dFrom, t.patch.dTo, chips(t)], [['Vídně'], '2026-11-27', '2026-12-21', ['vánoční trhy']]);
});

test('polární záře = letiště za polárním kruhem a Island (i „za polární září“ – to není září); safari, kultura, sever, autem nejsou místa', () => {
  const r = P('za polární září v lednu na 4 noci');
  assert.deepEqual([r.kind, r.items.map((x) => x.id), chips(r)], ['aurora', ['ap:TOS', 'ap:RVN', 'ap:KTT', 'ap:KEF'], ['polární záře', 'leden', '4 noci']]);
  assert.deepEqual(P('safari v Keni').to, ['Keni']);
  assert.deepEqual(P('kam za kulturou').to, []);
  assert.deepEqual(P('sever Španělska').to, ['Španělska']);
  assert.deepEqual(P('Portugalsko autem').to, ['Portugalsko']);
  assert.deepEqual(P('Severní Irsko').to, ['Severní Irsko']);
});

test('přesné datum s délkou: návrat dopočtený a vidět v čipu; mezi svátky, „a dítě“, lyžovačka, letní/zimní, zájezd a pobyt nejsou místa', () => {
  const r = P('Řím 3 noci od 5.12.');
  assert.deepEqual([r.patch.xOut, r.patch.xBack, chips(r)], ['2026-12-05', '2026-12-08', ['5. 12. – 8. 12.']]);
  assert.deepEqual(chips(P('na prodloužený víkend 28. října')), ['28. 10. – 1. 11.']);
  assert.deepEqual(chips(P('Paříž 5.12. jen tam')), ['5. 12.', 'jen tam']);
  const m = P('mezi svátky na hory');
  assert.deepEqual([m.kind, m.patch.dFrom, m.patch.dTo, chips(m)], ['mountains', '2026-12-26', '2026-12-30', ['na hory', 'mezi svátky']]);
  assert.deepEqual([P('dva dospělí a dítě do Barcelony').patch.adults, P('dva dospělí a dítě do Barcelony').patch.children, P('dva dospělí a dítě do Barcelony').to], [2, 1, ['Barcelony']]);
  assert.deepEqual([P('lyžovačka v Rakousku').kind, P('lyžovačka v Rakousku').to], ['mountains', ['Rakousku']]);
  assert.deepEqual([chips(P('letní dovolená Řecko')), P('letní dovolená Řecko').to], [['léto'], ['Řecko']]);
  assert.deepEqual(P('zájezd Chorvatsko').to, ['Chorvatsko']);
  assert.deepEqual(P('pobyt u moře září').to, []);
});

test('„od pátku“ = den odletu (ne místo odletu), den z věty přednost před dny délky; „ne“ není místo', () => {
  const r = P('od pátku do Říma');
  assert.deepEqual([r.from, r.to, r.patch.outDays, chips(r)], [[], ['Říma'], [5], ['odlet v pátek']]);
  const w = P('od soboty na týden do Paříže');
  assert.deepEqual([w.patch.outDays, w.patch.len, w.patch.nMin, w.patch.nMax], [[6], 'week', 5, 9]);
  assert.deepEqual([P('v sobotu na víkend').patch.outDays, P('v sobotu na víkend').patch.backDays], [[6], [0, 1]]);
  assert.deepEqual(P('Řím na víkend').patch.outDays, [4, 5, 6]);
  assert.deepEqual(P('v pátek na 3 noci').patch.outDays, [5]);
  assert.deepEqual(P('ne do Říma').to, ['Říma']);
});

test('„příští týden“ / „tento týden“ = kdy (po–ne), ne délka; „na týden“ dál délka', () => {
  const r = P('příští týden do Vídně');
  assert.deepEqual([r.to, r.patch.dFrom, r.patch.dTo, chips(r)], [['Vídně'], '2026-10-19', '2026-10-25', ['příští týden']]);
  assert.deepEqual([P('příští týden do Vídně', '2026-10-19').patch.dFrom, P('příští týden do Vídně', '2026-10-19').patch.dTo], ['2026-10-26', '2026-11-01']);
  const n = P('do Londýna na 2 noci příští týden');
  assert.deepEqual([n.to, n.patch.nMin, n.patch.dFrom], [['Londýna'], 2, '2026-10-19']);
  assert.equal(P('na týden do Říma').patch.len, 'week');
  assert.deepEqual([P('tento týden kamkoliv', '2026-10-15').patch.dFrom, P('tento týden kamkoliv', '2026-10-15').patch.dTo], ['2026-10-15', '2026-10-18']);
});

test('Objevuj: „o víkendu“, „příští týden“ (začátek, ne délka), „od pátku do neděle“ (dny + začátek), „v sobotu“', () => {
  const X = (q) => JSON.parse(JSON.stringify(Smart.parseExplore(q, { today })));
  assert.deepEqual([X('co dělat v Barceloně o víkendu').place, X('co dělat v Barceloně o víkendu').days], ['Barceloně', 2]);
  assert.deepEqual([X('Paříž příští týden').place, X('Paříž příští týden').days, X('Paříž příští týden').start], ['Paříž', null, '2026-10-19']);
  assert.deepEqual([X('Budapešť od pátku do neděle').days, X('Budapešť od pátku do neděle').start], [3, '2026-10-23']);
  assert.equal(X('Krakov v sobotu').start, '2026-10-24');
  assert.equal(X('Lisabon na týden').days, 7);
});

test('„a zpět z Neapole“ / „návrat z Porta“ = místo návratu (Víc měst se 2 lety); „tam a zpět“, „a zpět“ ne', () => {
  const r = P('do Říma a zpět z Neapole');
  assert.deepEqual([r.from, r.to, r.back], [[], ['Říma'], 'Neapole']);
  const b = P('z Brna do Lisabonu, návrat z Porta 5.–12. 11.');
  assert.deepEqual([b.from, b.to, b.back, b.patch.xOut, b.patch.xBack], [['Brna'], ['Lisabonu'], 'Porta', '2026-11-05', '2026-11-12']);
  assert.deepEqual([P('Praha → Neapol, zpět z Říma').from, P('Praha → Neapol, zpět z Říma').back], [['Praha'], 'Říma']);
  assert.equal(P('do Londýna tam a zpět').back, undefined);
  assert.equal(P('z Prahy do Paříže a zpět').back, undefined);
});

test('„pozítří“, „příští pátek“, „tuto sobotu“ = konkrétní den odletu; čip ukáže i dopočtený návrat', () => {
  // dnes ne 18. 10. 2026
  const r = P('příští pátek do Milána na víkend');
  assert.deepEqual([r.to, r.patch.dateMode, r.patch.xOut, r.patch.xBack], [['Milána'], 'exact', '2026-10-23', '2026-10-25']);
  assert.equal(chips(r)[0], 'pátek 23. 10. – 25. 10.');
  assert.equal(P('příští pátek do Milána', '2026-10-20').patch.xOut, '2026-10-30'); // z úterý: pátek příštího týdne
  assert.equal(P('tento pátek do Milána', '2026-10-20').patch.xOut, '2026-10-23');
  assert.equal(P('tuto sobotu do Vídně').patch.xOut, '2026-10-24');
  assert.equal(P('v příští pondělí do Londýna').patch.xOut, '2026-10-19');
  const z = P('pozítří do Vídně jen tam');
  assert.deepEqual([z.to, z.patch.xOut, z.patch.trip], [['Vídně'], '2026-10-20', 'oneway']);
  assert.equal(chips(P('zítra do Londýna'))[0], 'zítra – 26. 10.');
  // „romantický víkend v Paříži“: přívlastek není místo
  assert.deepEqual(P('romantický víkend v Paříži').to, ['Paříži']);
});

test('„5-9.12.“ bez tečky za prvním dnem; svátek s delším pobytem („na Silvestra na týden“) = odlet kolem svátku s tou délkou', () => {
  const v = P('Vídeň 5-9.12.');
  assert.deepEqual([v.to, v.patch.xOut, v.patch.xBack], [['Vídeň'], '2026-12-05', '2026-12-09']);
  // cena s pomlčkou není začátek rozsahu dnů
  const c = P('do 3000 – 9.12.');
  assert.deepEqual([c.patch.xOut, +c.patch.maxPrice], ['2026-12-09', 3000]);
  // Silvestr = být tam 31. 12.: odlet 27.–31. 12. (ne prodloužený víkend Nového roku – odlet 1. 1. by ho minul)
  const s = P('Tenerife na Silvestra na týden');
  assert.deepEqual([s.patch.len, s.patch.dateMode, s.patch.dFrom, s.patch.dTo], ['week', 'flex', '2026-12-27', '2026-12-31']);
  const s2 = P('Tenerife na Silvestra');
  assert.deepEqual([s2.patch.len, s2.patch.dFrom, s2.patch.dTo], ['long', '2026-12-27', '2026-12-31']);
  // „na Nový rok“ dál podle prodlouženého víkendu
  assert.equal(P('Londýn na Nový rok').patch.len, 'holiday');
});

test('věta: vánoční / velikonoční / pololetní / letní prázdniny, „na začátku / ke konci / uprostřed“ měsíce, „max.“, osoby bez náhodných míst', () => {
  const T = '2026-10-30', Q = (q) => P(q, T);
  const d = (r) => [r.patch.dFrom || r.patch.xOut, r.patch.dTo || r.patch.xBack];
  // vánoční prázdniny nejsou letní (dřív 1. 7.–31. 8. a „vánoční“ neznám)
  assert.notEqual(d(Q('k moři na vánoční prázdniny'))[0], '2027-07-01');
  assert.deepEqual(Q('k moři na vánoční prázdniny').miss || [], []);
  assert.match(d(Q('Řím na velikonoční prázdniny'))[0], /^2027-0[34]-/);
  assert.deepEqual(d(Q('na pololetní prázdniny do Londýna')), ['2027-01-28', '2027-02-03']);
  assert.deepEqual([...d(Q('k moři o letních prázdninách')), Q('k moři o letních prázdninách').to.length], ['2027-07-01', '2027-08-31', 0]);
  assert.deepEqual(Q('v létě o prázdninách').to, [], 'druhé období se spolkne, ne místo');
  // část měsíce i s „na začátku“, „ke konci“, „uprostřed“
  assert.deepEqual([...d(Q('Londýn na začátku prosince')), ...Q('Londýn na začátku prosince').to], ['2026-12-01', '2026-12-10', 'Londýn']);
  assert.deepEqual(d(Q('Paříž ke konci listopadu')), ['2026-11-20', '2026-11-30']);
  assert.deepEqual(d(Q('Paříž na konci listopadu')), ['2026-11-20', '2026-11-30']);
  assert.deepEqual(d(Q('Řím uprostřed ledna')), ['2027-01-10', '2027-01-20']);
  // „max.“ s tečkou
  assert.deepEqual([Q('Řím max. 4000').patch.maxPrice, Q('Řím max. 4000').to], ['4000', ['Řím']]);
  assert.equal(Q('k moři max. 5000').patch.maxPrice, '5000');
  // osoby a výplň – žádná náhodná místa (Ženeva, Osorno, Džidda, Lichtenštejnsko)
  assert.deepEqual([Q('na víkend se ženou').to, Q('na víkend se ženou').patch.adults], [[], 2]);
  assert.deepEqual([Q('do 2000 na osobu').to, Q('do 2000 za osobu').to], [[], []]);
  assert.deepEqual([Q('dva dospělí a jedno dítě').to, Q('dva dospělí a jedno dítě').patch.adults, Q('dva dospělí a jedno dítě').patch.children], [[], 2, 1]);
  assert.deepEqual([Q('ve dvou lidech do Říma').to, Q('ve dvou lidech do Říma').patch.adults], [['Říma'], 2]);
});

test('rozpočet: „mám 5000“, „za 2 litry“ (= 2 000 Kč), eura kurzem ze serveru (bez něj ~25 Kč)', () => {
  assert.deepEqual([P('mám 5000 na víkend').patch.maxPrice, P('mám 5000 na víkend').to], ['5000', []]);
  assert.equal(P('za 2 litry na víkend').patch.maxPrice, '2000');
  assert.equal(P('do 100 eur').patch.maxPrice, '2500');
  const r = JSON.parse(JSON.stringify(Smart.parse('Řím do 80 €', { today, presets, eurCzk: 24.3 })));
  assert.deepEqual([r.to, r.patch.maxPrice], [['Řím'], '1900']);
  assert.deepEqual(P('mám rád moře').to, []);
});

test('„Nové Město“: „město“ za slovem názvu patří k místu; samotné („do města“, „nějaké město u moře“) místo neurčuje', () => {
  assert.deepEqual(P('Nové Město').to, ['Nové Město']);
  assert.deepEqual(P('do Nového Města v květnu').to, ['Nového Města']);
  assert.deepEqual(P('výlet do města').to, []);
  assert.deepEqual(P('nějaké město u moře').to, []);
});

test('„z Kutné Hory“: „Hory“ za slovem názvu je jméno místa, ne „na hory“; „hory v únoru“, „chci hory“ dál hory', () => {
  const k = P('z Kutné Hory do Říma');
  assert.deepEqual([k.from, k.to, k.kind || null], [['Kutné Hory'], ['Říma'], null]);
  assert.equal(P('hory v únoru').kind, 'mountains');
  assert.equal(P('chci na hory').kind, 'mountains');
  assert.equal(P('levně hory').kind, 'mountains');
});

test('„Slunečné / Lazurové pobřeží“ je místo, „na pobřeží“ a „k moři“ dál moře', () => {
  assert.deepEqual([P('Slunečné pobřeží').to, P('Slunečné pobřeží').kind || null], [['Slunečné pobřeží'], null]);
  assert.deepEqual(P('na Lazurové pobřeží v červenci').to, ['Lazurové pobřeží']);
  assert.equal(P('na pobřeží v létě').kind, 'sea');
});

test('placeForms: „Kutné Hory“ → Kutná Hora, „Mariánských Lázní“ → Mariánské Lázně, „Karlových Varů“ → Karlovy Vary', () => {
  const F = (p) => JSON.parse(JSON.stringify(Smart.placeForms(p)));
  assert.equal(F('Kutné Hory')[0], 'Kutná Hora');
  assert.equal(F('Mariánských Lázní')[0], 'Mariánské Lázně');
  assert.equal(F('Karlových Varů')[0], 'Karlovy Vary');
  assert.ok(F('Českého Krumlova').includes('Český Krumlov'));
  assert.ok(F('Mladé Boleslavi').includes('Mladá Boleslav'));
  // jednoslovné a bez přídavného jména nic (žádné dotazy navíc)
  assert.deepEqual([F('Řím'), F('Hradce Králové'), F('Brno Londýn')], [[], [], []]);
});

test('✨ Zkus napsat: věta přes víc měst jen s domovem, který jde najít (ne „📍 Moje poloha“); Kamkoliv nejlevněji „3–9 nocí“, ne „týden“', () => {
  const fl = readFileSync(new URL('../public/js/flights.js', import.meta.url), 'utf8');
  const src = fl.slice(fl.indexOf('const homeWord = '), fl.indexOf('function paintSmartTry()'));
  const ctx = { S: {}, MNS_IN: ['lednu', 'únoru', 'březnu', 'dubnu', 'květnu', 'červnu', 'červenci', 'srpnu', 'září', 'říjnu', 'listopadu', 'prosinci'], today: () => '2026-10-30' };
  vm.createContext(ctx);
  vm.runInContext(`${src}; this.tryList = tryList; this.homeWord = homeWord;`, ctx);
  const at = (home) => { ctx.S.home = home ? { from: [home] } : null; return ctx.tryList('2026-10-30'); };
  assert.ok(at({ id: 'ap:BRQ', type: 'airport', label: 'Brno' }).includes('Brno → Řím → Barcelona → Brno'));
  assert.ok(at({ id: 'BRQ', label: 'Brno (BRQ)' }).includes('Brno → Řím → Barcelona → Brno'));
  assert.ok(!at({ id: 'geo:50.0880,14.4208|Moje poloha', type: 'place', label: 'Moje poloha' }).some((x) => /→/.test(x)), 'Moje poloha: bez věty přes víc měst');
  assert.ok(!at(null).some((x) => /→/.test(x)), 'bez domova taky');
  // Rychlé hledání bez délky (Kamkoliv nejlevněji): vlastní 3–9 nocí, ne předvolba „týden“ (5–9)
  assert.match(fl, /else Object\.assign\(f, \{ len: 'custom', nMin: 3, nMax: 9, outDays: \[\], backDays: \[\] \}\);/);
});

test('s kým: „s přáteli / s partou / s kolegy / s rodiči / se psem“ nejsou místo cesty', () => {
  assert.deepEqual(P('s přáteli do Paříže').to, ['Paříže']);
  assert.deepEqual(P('s kolegy do Berlína').to, ['Berlína']);
  assert.deepEqual(P('s rodiči do Vídně').to, ['Vídně']);
  assert.deepEqual(P('se psem do Itálie').to, ['Itálie']);
  assert.deepEqual(P('s babičkou do Říma').to, ['Říma']);
  assert.deepEqual(P('s mámou a tátou do Londýna').to, ['Londýna']);
  assert.deepEqual(P('s klukem a dcerou').to, []);
  assert.deepEqual(P('pro celou rodinu').to, []);
  for (const q of ['s partou na hory', 's holkama k moři', 'k moři s kamarády', 's kámoši na víkend', 's kamarádkami']) assert.deepEqual(P(q).to, [], q);
  assert.deepEqual(chips(P('s kámoši na víkend')), ['víkend']);
  // jména míst s podobným začátkem zůstanou místy
  for (const q of ['Celle', 'Partenkirchen', 'Kolín', 'Holkham']) assert.deepEqual(P(q).to, [q]);
});

test('„první / poslední víkend v prosinci“, „druhý týden v únoru“: jen ten týden měsíce, ne celý měsíc a „první“ jako místo', () => {
  const d = (q, t) => { const r = P(q, t); return [r.patch.dateMode, r.patch.dFrom, r.patch.dTo, r.patch.len, r.to.length]; };
  assert.deepEqual(d('první víkend v prosinci'), ['flex', '2026-12-03', '2026-12-05', 'weekend', 0]);
  assert.deepEqual(chips(P('první víkend v prosinci')), ['první víkend prosince', 'víkend']);
  assert.deepEqual(d('poslední víkend v listopadu'), ['flex', '2026-11-26', '2026-11-28', 'weekend', 0]);
  assert.deepEqual(d('druhý týden v únoru'), ['flex', '2027-02-08', '2027-02-14', 'week', 0]);
  assert.deepEqual(d('poslední týden v prosinci'), ['flex', '2026-12-25', '2026-12-31', 'week', 0]);
  // letošní první víkend v říjnu už byl → příští rok; sobota 2. 10. 2027 → odlet od čtvrtka 30. 9.
  assert.deepEqual(d('první víkend v říjnu'), ['flex', '2027-09-30', '2027-10-02', 'weekend', 0]);
  // probíhající víkend: od dneška
  assert.deepEqual(d('poslední víkend v říjnu', '2026-10-30'), ['flex', '2026-10-30', '2026-10-31', 'weekend', 0]);
  assert.deepEqual(P('první víkend v listopadu do Vídně').to, ['Vídně']);
});

test('„mezi 10. a 20. listopadem“ = odlet v tom rozmezí; „do konce listopadu / roku“ = od dneška', () => {
  const d = (q) => { const r = P(q); return [r.patch.dateMode, r.patch.dFrom, r.patch.dTo, r.to.length]; };
  assert.deepEqual(d('mezi 10. a 20. listopadem'), ['flex', '2026-11-10', '2026-11-20', 0]);
  assert.deepEqual(d('mezi 10. 11. a 20. 11.'), ['flex', '2026-11-10', '2026-11-20', 0]);
  assert.deepEqual(d('mezi 28. 12. a 3. 1.'), ['flex', '2026-12-28', '2027-01-03', 0]);
  assert.deepEqual(chips(P('mezi 10. a 20. listopadem')), ['10. 11. – 20. 11.']);
  assert.deepEqual(d('do konce listopadu'), ['flex', '2026-10-18', '2026-11-30', 0]);
  assert.deepEqual(chips(P('Řím do konce března')), ['do konce března']);
  assert.deepEqual(P('Řím do konce března').to, ['Řím']);
  assert.deepEqual(d('do konce roku'), ['flex', '2026-10-18', '2026-12-31', 0]);
  // „koncem / na konci listopadu“ dál jen poslední třetina
  assert.deepEqual(d('koncem listopadu'), ['flex', '2026-11-20', '2026-11-30', 0]);
  assert.deepEqual(d('na konci listopadu'), ['flex', '2026-11-20', '2026-11-30', 0]);
});

test('„s mámou a tátou“ = 3 osoby (já + oba), „se ženou“ dál 2', () => {
  const ad = (q) => P(q).patch.adults;
  assert.equal(ad('s mámou a tátou do Londýna'), 3);
  assert.equal(ad('s manželkou a se synem k moři'), 3);
  assert.equal(ad('se ženou do Říma'), 2);
  assert.equal(ad('s přítelkyní'), 2);
  assert.deepEqual(chips(P('s mámou a tátou do Londýna')), ['3 osoby']);
  // „a 2 dětmi“ dál děti, ne třetí dospělý
  assert.deepEqual([P('s mámou a 2 dětmi').patch.adults, P('s mámou a 2 dětmi').patch.children], [2, 2]);
});

test('„k oceánu“ = k moři; „na Balkán / do Skandinávie / Pobaltí“ = země té oblasti (ne letiště Balkanabat)', () => {
  assert.equal(P('k oceánu').kind, 'sea');
  assert.deepEqual(P('k oceánu').to, []);
  assert.deepEqual(P('Atlantský oceán').to, ['Atlantský oceán'], 'jméno oceánu bez předložky zůstane místem');
  const b = P('na Balkán v červnu');
  assert.deepEqual([b.group, b.to, b.items.map((x) => x.id)], ['balkan', [], ['cc:HR', 'cc:ME', 'cc:AL', 'cc:RS', 'cc:BA']]);
  assert.deepEqual(chips(b), ['Balkán', 'červen']);
  assert.deepEqual(P('do Skandinávie').items.map((x) => x.id), ['cc:NO', 'cc:SE', 'cc:DK', 'cc:FI']);
  assert.deepEqual(chips(P('Pobaltí na víkend')), ['Pobaltí', 'víkend']);
  // s „k moři“ oblast vyhrává (konkrétnější než regiony u moře), štítek moře zůstane
  const s = P('k moři na Balkán');
  assert.deepEqual([chips(s), s.items[0].id], [['k moři', 'Balkán'], 'cc:HR']);
});

test('„do tisícovky / pětistovky“ = cena; „celkem / dohromady / za oba“ se vydělí počtem lidí (ceny jsou na osobu)', () => {
  const mp = (q) => P(q).patch.maxPrice;
  assert.deepEqual([mp('do tisícovky'), mp('do pětistovky'), mp('Řím do dvoutisícovky')], ['1000', '500', '2000']);
  assert.deepEqual(P('do tisícovky').to, []);
  assert.deepEqual(P('Řím do dvoutisícovky').to, ['Řím']);
  assert.equal(mp('celkem do 10 000 pro dva'), '5000');
  assert.deepEqual(chips(P('celkem do 10 000 pro dva')), ['do 5 000 Kč/os.', '2 osoby']);
  assert.deepEqual(P('celkem do 10 000 pro dva').to, [], '„celkem“ není místo');
  const oba = P('do 4000 za oba');
  assert.deepEqual([oba.patch.maxPrice, oba.patch.adults], ['2000', 2]);
  assert.equal(mp('dohromady do 12000 pro 2 dospělé a 2 děti'), '3000');
  // počet lidí neznámý: částka zůstane, „na osobu“ beze změny
  assert.deepEqual([mp('celkem do 5000'), mp('do 3000 na osobu')], ['5000', '3000']);
});

test('„přes Vídeň“ je přestup, ne cíl; „odkudkoliv“, „z okolí Brna“, „z domova“ místo neurčují', () => {
  assert.deepEqual([P('z Prahy přes Vídeň do Bangkoku').from, P('z Prahy přes Vídeň do Bangkoku').to], [['Prahy'], ['Bangkoku']]);
  assert.deepEqual(P('Bangkok přes Dubaj').to, ['Bangkok']);
  assert.deepEqual(P('přes víkend do Říma').to, ['Říma']);
  assert.deepEqual(P('odkudkoliv do Londýna').to, ['Londýna']);
  assert.deepEqual(P('z okolí Brna').from, ['Brna']);
  assert.deepEqual([P('z domova k moři').from, P('z domova k moři').kind], [[], 'sea']);
});

test('dvě samostatná data = tam a zpět: „do Říma 15.11. a zpět 18.11.“, „odlet 20. listopadu, návrat 25. listopadu“', () => {
  const d = (q) => { const r = P(q); return [r.patch.dateMode, r.patch.xOut, r.patch.xBack, r.to]; };
  // dřív druhé datum přepsalo odlet: 18. 11. – 25. 11.
  assert.deepEqual(d('chci letět do Říma 15.11. a zpět 18.11.'), ['exact', '2026-11-15', '2026-11-18', ['Říma']]);
  assert.deepEqual(d('odlet 20.11. návrat 25.11.'), ['exact', '2026-11-20', '2026-11-25', []]);
  assert.deepEqual(d('letím 15.11., vracím se 18.11.'), ['exact', '2026-11-15', '2026-11-18', []]);
  assert.deepEqual(d('28.12. a zpět 3.1.'), ['exact', '2026-12-28', '2027-01-03', []]);
  assert.deepEqual(d('odlet 20. listopadu, návrat 25. listopadu'), ['exact', '2026-11-20', '2026-11-25', []]);
  assert.deepEqual(d('tam 20. listopadu a zpět 2. prosince'), ['exact', '2026-11-20', '2026-12-02', []]);
  assert.deepEqual(d('15.11. a zpět 18. listopadu'), ['exact', '2026-11-15', '2026-11-18', []]);
  // jedno datum dál odlet (návrat dopočítá formulář), rozsah dál rozsah
  assert.deepEqual(d('od 3. do 7. prosince').slice(1, 3), ['2026-12-03', '2026-12-07']);
  assert.equal(P('Barcelona 12.12. jen tam').patch.xBack, undefined);
  // „weekend“ jako víkend, „teď“ není místo
  assert.deepEqual([P('London weekend').patch.len, P('London weekend').to], ['weekend', ['London']]);
  assert.deepEqual(P('kde je teď teplo').to, []);
});

test('čas letu, přestupy a aerolinky ve větě: nejsou místo, štítek řekne, že se nastaví ve Filtrech výsledků', () => {
  const hint = (q) => chips(P(q)).find((c) => /nastavíš ve Filtrech/.test(c)) || '';
  for (const q of ['Řím ráno', 'odlet po 10', 'přílet do 20 hodin', 'večerní let', 'ne brzo ráno']) {
    assert.match(hint(q), /^čas letu – /, q);
    assert.ok(!P(q).to.some((x) => /ráno|hodin|večerní|brzo/i.test(x)), q);
  }
  assert.deepEqual(P('Řím ráno').to, ['Řím']);
  assert.match(hint('max 1 přestup'), /^přestupy – /);
  assert.deepEqual([hint('Ryanairem do Říma'), P('Ryanairem do Říma').to], ['aerolinky – nastavíš ve Filtrech', ['Říma']]);
  assert.deepEqual(P('bez Ryanairu').to, []);
  // děti a výbava: „s batoletem“ = dítě, „s kočárkem“ není místo, „s lyžemi“ = na hory
  assert.equal(P('s batoletem').patch.children, 1);
  assert.deepEqual(P('s kočárkem do Říma').to, ['Říma']);
  assert.equal(P('s lyžemi').kind, 'mountains');
  // ceny a data dál beze změny
  assert.equal(P('do 2000').patch.maxPrice, '2000');
  assert.equal(P('do 20. listopadu').patch.xOut, '2026-11-20');
});

test('svátky a délka: „na Štědrý den“ = Vánoce, „na státní svátek v listopadu“, „na měsíc“, „na půl roku“ = jen tam, „příští rok“', () => {
  const d = (q, t) => { const r = P(q, t); return [r.patch.dFrom, r.patch.dTo, r.to]; };
  assert.deepEqual(chips(P('na Štědrý den')), ['Vánoce']);
  assert.deepEqual(P('na Štědrý večer do Vídně').to, ['Vídně']);
  // svátek v tom měsíci, ne celý měsíc a „státní svátek“ jako místo
  const sv = P('na státní svátek v listopadu');
  assert.deepEqual([chips(sv), sv.to], [['Den boje za svobodu'], []]);
  // ~4 týdny; „za měsíc“ a „příští měsíc“ dál termín
  assert.deepEqual([P('měsíc v Thajsku').patch.nMin, P('měsíc v Thajsku').patch.nMax, P('měsíc v Thajsku').to], [27, 30, ['Thajsku']]);
  assert.deepEqual(chips(P('za měsíc')), ['za měsíc']);
  // pobyt přes 45 nocí: jen tam
  for (const q of ['na 2 měsíce do Thajska', 'na půl roku', 'na rok do Austrálie']) {
    assert.equal(P(q).patch.trip, 'oneway', q);
    assert.ok(chips(P(q)).includes('jen tam (zpět hledej zvlášť)'), q);
  }
  // „příští rok“ není místo; s měsícem (do roka dopředu) ten měsíc v příštím roce
  assert.deepEqual(P('příští rok v létě').to, []);
  assert.deepEqual(d('příští rok v listopadu', '2026-10-31').slice(0, 2), ['2026-11-01', '2026-11-30'], 'listopad 2027 je za víc než rok – nejbližší');
  assert.deepEqual(d('příští rok v říjnu', '2026-10-31').slice(0, 2), ['2027-10-01', '2027-10-31'], 'letošní říjen končí – říjen příštího roku');
  // Dušičky: ne místo
  assert.deepEqual(P('na Dušičky').to, []);
});

test('Objevuj větou: „na den“ = 1 den, „procházka po Budapešti“ – místo je Budapešť, ne „procházka“', () => {
  const E = (q) => JSON.parse(JSON.stringify(Smart.parseExplore(q, { today: '2026-10-31' })));
  assert.deepEqual([E('Drážďany s dětmi na den').days, E('Drážďany s dětmi na den').place], [1, 'Drážďany']);
  assert.deepEqual([E('na den do Vídně').days, E('na den do Vídně').place], [1, 'Vídně']);
  assert.equal(E('Praha na 3 dny').days, 3, 'počet dní dál přednost');
  assert.equal(E('procházka po Budapešti').place, 'Budapešti');
});

test('Objevuj větou: „nejhezčí místa v Portugalsku“, „vyhlídky v Českém Švýcarsku“, „hřebenovka“, „k jezeru“ nejsou místo', () => {
  const E = (q) => JSON.parse(JSON.stringify(Smart.parseExplore(q, { today: '2026-10-31' })));
  assert.equal(E('nejhezčí místa v Portugalsku').place, 'Portugalsku');
  assert.deepEqual([E('vyhlídky v Českém Švýcarsku').place, E('vyhlídky v Českém Švýcarsku').interests], ['Českém Švýcarsku', ['nature']]);
  assert.deepEqual([E('Beskydy hřebenovka 2 dny').place, E('Beskydy hřebenovka 2 dny').mode], ['Beskydy', 'hike']);
  assert.deepEqual([E('výlet k jezeru').place, E('výlet k jezeru').interests], ['', ['nature']]);
  assert.equal(E('k Lipenskému jezeru').place, 'Lipenskému jezeru', 'jezero se jménem dál místo');
});

test('„Štědrý den do Londýna a zpět 27.12.“ = 24.–27. 12.; „přímým letem“ – „letem“ není místo', () => {
  const r = P('Štědrý den do Londýna a zpět 27.12.', '2026-10-31');
  assert.deepEqual([r.patch.xOut, r.patch.xBack, r.to], ['2026-12-24', '2026-12-27', ['Londýna']]);
  assert.deepEqual(P('přímým letem do Říma').to, ['Říma']);
  assert.deepEqual(P('k moři v květnu přímým letem').to, []);
});

test('z kontroly dnešních změn: obrácená data, „přes víkend“, „tento měsíc“, „v příštích 2 měsících“, Vánoce v létě, děti, „k moři“', () => {
  const T = '2026-10-31';
  const x = (q, t = T) => { const p = P(q, t).patch; return p.dateMode === 'exact' ? [p.xOut, p.xBack] : [p.dFrom, p.dTo]; };
  // druhé datum dřív než první (číselné pravidlo projde větu dřív než „15. listopadu“) – dřív návrat za rok
  assert.deepEqual(x('odlet 15. listopadu, návrat 18.11. do Říma'), ['2026-11-15', '2026-11-18']);
  assert.deepEqual(x('15. prosince do Londýna, zpět 20.12.'), ['2026-12-15', '2026-12-20']);
  assert.deepEqual(x('do Říma 20.11. a zpět 15.11.'), ['2026-11-15', '2026-11-20']);
  assert.deepEqual(x('28.12. do Londýna zpět 3.1.'), ['2026-12-28', '2027-01-03'], 'přes Nový rok dál do příštího roku');
  // „přes“ + slovo vzaté pravidlem: cíl za ním zůstane
  assert.deepEqual(P('přes víkend Londýn', T).to, ['Londýn']);
  assert.deepEqual(P('přes léto Chorvatsko', T).to, ['Chorvatsko']);
  assert.deepEqual(P('z Prahy přes Vídeň do Bangkoku', T).to, ['Bangkoku']);
  // „tento měsíc“ = do konce měsíce, „za měsíc“ s jiným termínem není pobyt na měsíc
  const tm = P('tento měsíc do Říma', '2026-11-10').patch;
  assert.deepEqual([tm.dFrom, tm.dTo, tm.len], ['2026-11-10', '2026-11-30', undefined]);
  assert.equal(P('v prosinci nebo za měsíc do Říma', T).patch.len, undefined);
  assert.equal(P('na měsíc do Thajska', T).patch.nMin, 27, '„na měsíc“ dál ~4 týdny');
  // „v příštích dvou měsících“, „do 3 měsíců“ = kdy od dneška, ne jen tam
  const two = P('někdy v příštích dvou měsících do Londýna', T);
  assert.deepEqual([two.patch.trip, two.patch.dFrom, two.patch.dTo, two.to], [undefined, T, '2026-12-30', ['Londýna']]);
  assert.equal(P('do 3 měsíců do Londýna', T).patch.trip, undefined);
  assert.equal(P('na 2 měsíce do Thajska', T).patch.trip, 'oneway', '„na 2 měsíce“ dál jen tam');
  // Štědrý den s návratem i v létě (Vánoce ještě nejsou mezi prodlouženými víkendy)
  assert.deepEqual(x('Štědrý den do Londýna a zpět 27.12.', '2026-06-01'), ['2026-12-24', '2026-12-27']);
  // rozmezí, které už začalo: od dneška, ne za rok
  assert.deepEqual(x('mezi 1. a 15. listopadem do Říma', '2026-11-05'), ['2026-11-05', '2026-11-15']);
  // „pro jedno dítě a dva dospělé“ = 2 + 1
  const k = P('pro jedno dítě a dva dospělé do Říma', T);
  assert.deepEqual([k.patch.adults, k.patch.children, k.to], [2, 1, ['Říma']]);
  // Silvestr s daty není místo; „k moři“ za částkou není tisíc
  assert.deepEqual(P('Silvestr v Londýně 27.12.–2.1.', T).to, ['Londýně']);
  assert.deepEqual([P('do 6000 k moři', T).patch.maxPrice, P('do 6k k moři', T).patch.maxPrice, P('do 6 k', T).patch.maxPrice], ['6000', '6000', '6000']);
});

test('„Řím 20.11. nebo 27.11.“ = odlet kdykoli mezi nimi (dvě možnosti), ne tam a zpět', () => {
  const r = (q) => { const p = P(q, '2026-10-31').patch; return [p.dateMode === 'exact', p.dFrom || p.xOut, p.dTo || p.xBack]; };
  assert.deepEqual(r('Řím 20.11. nebo 27.11.'), [false, '2026-11-20', '2026-11-27']);
  assert.deepEqual(r('Řím 27.11. nebo 20.11.'), [false, '2026-11-20', '2026-11-27']);
  assert.deepEqual(r('do Londýna 20. listopadu nebo 27. listopadu'), [false, '2026-11-20', '2026-11-27']);
  assert.deepEqual(r('Řím 28.12. nebo 2.1.'), [false, '2026-12-28', '2027-01-02']);
  assert.deepEqual(r('Řím 20.11. a zpět 27.11.'), [true, '2026-11-20', '2026-11-27'], '„a zpět“ dál tam a zpět');
  // „nebo“ mezi místy (ne přímo mezi daty) návrat nezahodí
  assert.deepEqual(r('20.11. Řím nebo Milán, zpět 27.11.'), [true, '2026-11-20', '2026-11-27']);
  assert.deepEqual(r('Londýn 20.11. nebo Paříž zpět 24.11.'), [true, '2026-11-20', '2026-11-24']);
  assert.deepEqual(r('20.11. z Prahy nebo z Vídně, zpět 27.11.'), [true, '2026-11-20', '2026-11-27']);
  assert.deepEqual(r('Řím 20.11., nebo 27.11.'), [false, '2026-11-20', '2026-11-27'], 'čárka před „nebo“ nevadí');
  // „nebo“ s dalším slovem mezi daty dál dvě možnosti odletu
  for (const q of ['Řím 20.11. nebo až 27.11.', 'Řím 20.11. nebo klidně 27.11.', 'Řím v pátek 20.11. nebo v pátek 27.11.', 'Řím 20.11. (nebo 27.11.)', 'Řím 20. listopadu nebo až 27. listopadu']) {
    assert.deepEqual(r(q), [false, '2026-11-20', '2026-11-27'], q);
  }
  assert.deepEqual(P('Řím 20.11. nebo až 27.11.', '2026-10-31').to, ['Řím'], '„až“ není místo');
});

test('svátek a „zpět / návrat“ s datem před koncem svátku: datum je návrat, svátek odlet (z kontroly #317–#323)', () => {
  const x = (q) => { const p = P(q, '2026-10-31').patch; return p.dateMode === 'exact' ? [p.xOut, p.xBack] : [p.dFrom, p.dTo]; };
  assert.deepEqual(x('Vánoce v Londýně a zpět 26.12.'), ['2026-12-24', '2026-12-26']);
  assert.deepEqual(x('o Vánocích do Londýna, návrat 26.12.'), ['2026-12-24', '2026-12-26']);
  assert.deepEqual(x('Štědrý den do Londýna a zpět 27.12.'), ['2026-12-24', '2026-12-27'], 'jako dřív');
  // slova mezi „zpět“ a datem; Silvestr se „zpět“ = odlet 31. 12.
  assert.deepEqual(x('Vánoce v Londýně a zpět v sobotu 26.12.'), ['2026-12-24', '2026-12-26']);
  assert.deepEqual(x('Vánoce v Londýně a zpět do Prahy 26.12.'), ['2026-12-24', '2026-12-26']);
  assert.deepEqual(x('Silvestr v Londýně a zpět 1.1.'), ['2026-12-31', '2027-01-01']);
  assert.deepEqual(x('Silvestr v Londýně, návrat 2.1.'), ['2026-12-31', '2027-01-02']);
  assert.deepEqual(x('Silvestr v Londýně 27.12.–2.1.'), ['2026-12-27', '2027-01-02'], 'rozsah z věty platí');
});

test('z kontroly #312–#316: „do 5 k na víkend“, návrat přes Nový rok přes 45 nocí, svátek s datem odletu, batolata, „v příštím měsíci“, „nebo“ v obou pořadích', () => {
  const T = '2026-10-31';
  const x = (q, t = T) => { const p = P(q, t).patch; return p.dateMode === 'exact' ? [p.xOut, p.xBack] : [p.dFrom, p.dTo]; };
  // mezera před „k“ = tisíce (i před dalším slovem); „k moři“ za částkou dál předložka
  assert.deepEqual([P('Řím do 5 k na víkend', T).patch.maxPrice, P('max 5 k do Londýna', T).to, P('Londýn do 4 k Kč', T).to], ['5000', ['Londýna'], ['Londýn']]);
  assert.deepEqual([P('do 6000 k moři', T).patch.maxPrice, P('do 6000 k moři', T).kind], ['6000', 'sea']);
  // návrat po Novém roce přes 45 nocí: zůstane, jak ho uživatel napsal (ne tichých 7 nocí)
  assert.deepEqual(x('Bangkok 1.12. a zpět 28.2.'), ['2026-12-01', '2027-02-28']);
  const lg = P('Bangkok 1.12. a zpět 28.2.', T);
  assert.deepEqual([lg.patch.trip, chips(lg).includes('jen tam (zpět hledej zvlášť)')], ['oneway', true], 'přes 45 nocí jen tam – zpáteční hledání nenajde');
  assert.deepEqual(x('28.12. do Londýna zpět 3.1.', '2026-01-01'), ['2026-12-28', '2027-01-03'], 'v lednu dál přes Nový rok');
  // datum před koncem svátku je odlet („od 26.3. o Velikonocích“), ne návrat; délka beze změny
  assert.deepEqual(x('Velikonoce v Římě od 26.3.'), ['2027-03-26', '2027-04-02']);
  assert.deepEqual(x('Londýn 30.12. na Nový rok', '2026-08-01'), ['2026-12-30', '2027-01-06']);
  assert.deepEqual(x('Řím 10.11. o Velikonocích'), ['2026-11-10', '2026-11-17']);
  assert.deepEqual(x('Štědrý den do Londýna a zpět 27.12.', '2026-06-01'), ['2026-12-24', '2026-12-27'], 'zpět po svátcích dál návrat');
  // děti a měsíc
  assert.equal(P('pro dvě batolata do Říma', T).patch.children, 2);
  assert.deepEqual([P('Řím v příštím měsíci', T).to, P('Řím v příštím měsíci', T).patch.dFrom], [['Řím'], '2026-11-01']);
  // „nebo“ mezi daty i v pořadí slovní → číselné
  assert.deepEqual(x('Řím 20. listopadu nebo 27.11.'), ['2026-11-20', '2026-11-27']);
  assert.equal(P('Řím 20. listopadu nebo 27.11.', T).patch.dateMode === 'exact', false);
});

test('regrese z přehledu 609 vět (#308–#327): „nebo“ mezi místy s „zpátky“ za datem, po svátku, zpátky v neděli, třetí datum, zítra a zpět', () => {
  const T = '2026-10-31';
  const x = (q, t = T) => { const p = P(q, t).patch; return p.dateMode === 'exact' ? [p.xOut, p.xBack] : [p.dFrom, p.dTo]; };
  // „nebo“ mezi místy, „zpátky / zpět“ až za druhým datem: tam a zpět
  assert.deepEqual(x('20.11. do Říma nebo Milána a 27.11. zpátky'), ['2026-11-20', '2026-11-27']);
  assert.equal(P('20.11. Londýn nebo Dublin a 27.11. zpět', T).patch.dateMode, 'exact');
  assert.deepEqual(x('Řím 20.11. nebo 27.11. a zpět 30.11.'), ['2026-11-20', '2026-11-27'], 'za „zpět“ další datum: „nebo“ dál dvě možnosti');
  // po svátku: datum je odlet
  assert.deepEqual(x('po Vánocích do Londýna 28.12.')[0], '2026-12-28');
  assert.deepEqual(x('po Velikonocích do Říma 6.4.')[0], '2027-04-06');
  assert.deepEqual(x('Vánoce v Londýně a zpět 26.12.'), ['2026-12-24', '2026-12-26'], 'se „zpět“ dál návrat');
  // „od 5. do 9. 12.“ = rozsah; třetí datum termín nepřepíše
  assert.deepEqual(x('Londýn od 5. do 9. 12.'), ['2026-12-05', '2026-12-09']);
  assert.deepEqual(x('Londýn 20.11. a zpět 27.11. nebo 28.11.'), ['2026-11-20', '2026-11-27']);
  // „20. nebo 27. listopadu“ = odlet kdykoli mezi nimi
  const nb = P('20. nebo 27. listopadu do Říma', T).patch;
  assert.deepEqual([nb.dateMode === 'exact', nb.dFrom, nb.dTo], [false, '2026-11-20', '2026-11-27']);
  // zítra a zpět datem; den v týdnu po „zpátky“ = návrat
  assert.deepEqual(x('zítra do Londýna a zpět 5.11.'), ['2026-11-01', '2026-11-05']);
  assert.deepEqual(P('zítra do Londýna a zpět 5.11.', T).to, ['Londýna']);
  assert.deepEqual(x('do Říma 20.11., zpátky v neděli'), ['2026-11-20', '2026-11-22']);
  const wd = P('Řím v pátek zpátky v neděli', T).patch;
  assert.deepEqual([wd.outDays, wd.backDays], [[5], [0]]);
  // výplňová slova a Silvestr bez „r“ na konci
  assert.deepEqual(P('potřebuju letenku do Londýna', T).to, ['Londýna']);
  assert.deepEqual(P('pátek 20.11. – neděle 22.11. Londýn', T).to, ['Londýn']);
  assert.ok(P('na silvester do berlina', T).patch.dFrom, 'Silvestr i jako „silvester“');
});

test('hledání větou: rodina 2+2, „do 2,5 tisíce“, „odlet 28. prosince, návrat 3.1.“', () => {
  const T = '2026-10-31';
  const r = P('rodina 2+2 k moři', T).patch;
  assert.deepEqual([r.adults, r.children], [2, 2]);
  const q = P('2+1 do Říma', T);
  assert.deepEqual([q.patch.adults, q.patch.children, q.to], [2, 1, ['Říma']]);
  const pr = P('do 2,5 tisíce do Londýna', T);
  assert.deepEqual([pr.patch.maxPrice, pr.to], ['2500', ['Londýna']]);
  assert.equal(P('max 3,5k Řím', T).patch.maxPrice, '3500');
  const d = P('odlet 28. prosince, návrat 3.1.', T).patch;
  assert.deepEqual([d.xOut, d.xBack], ['2026-12-28', '2027-01-03']);
});

test('„tento měsíc“ v posledních dnech měsíce: nejbližší týden, ne jen dnešek', () => {
  const p = P('kamkoliv do 3000 tento měsíc', '2026-10-31').patch;
  assert.deepEqual([p.dFrom, p.dTo], ['2026-10-31', '2026-11-06']);
  const q = P('kamkoliv tento měsíc', '2026-10-10').patch;
  assert.deepEqual([q.dFrom, q.dTo], ['2026-10-10', '2026-10-31'], 'jinak do konce měsíce');
});

test('rozpočet u víc lidí: štítek „/os.“ (cena v hledání je na osobu)', () => {
  assert.ok(chips(P('rodina 2+2 k moři do 15 tisíc', '2026-10-31')).includes('do 15 000 Kč/os.'));
  assert.ok(chips(P('Londýn do 5000', '2026-10-31')).includes('do 5 000 Kč'), 'bez lidí beze změny');
});

test('náhled věty: lidé z minulého hledání, které věta neříká, se ukážou štítkem 👥 (jinak tiše hledá pro rodinu)', () => {
  const fl = readFileSync(new URL('../public/js/flights.js', import.meta.url), 'utf8');
  assert.match(fl, /inh = !\('adults' in \(h\.sm\.patch \|\| \{\}\)\) && \(\(\+pf\.adults \|\| 2\) !== 2 \|\| \+pf\.children > 0 \|\| \+pf\.infants > 0\);/);
  assert.match(fl, /\.\.\.\(inh \? \[`👥 \$\{SearchHelp\.paxShort\(pf\)\} \(jako minule\)`\] : \[\]\)/);
  assert.match(fl, /const perOs = c => \(inh && c\.icon === '💰' && !\/\\\/os\\\.\$\/\.test\(c\.text\)/, 'cena s lidmi z minula /os.');
});

test('„zpět do X“ = odkud letím, ne druhý cíl; „jedno miminko“ není místo', () => {
  const r = P('Řím 12.11. zpět do Prahy 16.11.');
  assert.deepEqual([r.from, r.to], [['Prahy'], ['Řím']]);
  assert.deepEqual([r.patch.xOut, r.patch.xBack], ['2026-11-12', '2026-11-16']);
  assert.deepEqual([P('do Londýna a zpět do Prahy').from, P('do Londýna a zpět do Prahy').to], [['Prahy'], ['Londýna']]);
  // odkud už je dané: návrat jinam se nehledá jako druhý cíl
  assert.deepEqual([P('z Vídně do Londýna a zpět do Prahy').from, P('z Vídně do Londýna a zpět do Prahy').to], [['Vídně'], ['Londýna']]);
  // jediné místo kam zůstane cílem
  assert.deepEqual(P('zpátky do Brna z Londýna v neděli').to, ['Brna']);
  // „do“ až za datem po „zpátky“ je cíl
  assert.deepEqual(P('tam 20.11. a zpátky 24.11. do Londýna').to, ['Londýna']);
  const b = P('Barcelona pro jedno miminko a 2 dospělé');
  assert.deepEqual(b.to, ['Barcelona']);
  assert.deepEqual([b.patch.adults, b.patch.children, b.patch.infants], [2, 0, 1]);
  assert.deepEqual(P('Paříž s jedním dítětem a jedno miminko').to, ['Paříž']);
});

test('věk dětí: do 2 let miminko, 2–11 dítě, od 12 let platí jako dospělý', () => {
  const pax = q => { const r = P(q); return [r.patch.adults, r.patch.children, r.patch.infants]; };
  assert.deepEqual(pax('Řecko v červnu s dětmi 5 a 8 let'), [2, 2, 0]);
  assert.equal(P('Řecko v červnu s dětmi 5 a 8 let').askPax, undefined, 'počet dětí je známý – bez „uprav v Cestujících“');
  assert.deepEqual(pax('Řecko s dětmi (1, 4 a 13 let)'), [3, 1, 1]);
  assert.deepEqual(pax('Itálie s dítětem 1 rok'), [2, 0, 1]);
  assert.deepEqual(pax('Itálie s dítětem 6 let'), [2, 1, 0]);
  assert.deepEqual(pax('Řím pro 3 dospělé s dětmi 4 a 9 let'), [3, 2, 0]);
  const m = P('Malta s dětmi ve věku 3 a 7');
  assert.deepEqual([m.to, m.patch.children], [['Malta'], 2]);
  // „2 týdny“ není věk
  assert.equal(P('s dětmi 2 týdny v Chorvatsku').patch.children, undefined);
  assert.equal(P('s dětmi 2 týdny v Chorvatsku').patch.len, '2weeks');
});

test('období, které končí do 2 dnů („podzimní prázdniny“ 31. 10.), je až příští rok; „20 kg“ a „po práci“ nejsou místo', () => {
  // dřív odlet jen 31. 10.–1. 11. se dny odletu st–pá → žádný let
  for (const t of ['2026-10-31', '2026-11-01']) {
    const r = P('Mallorca na podzimní prázdniny', t);
    assert.deepEqual([r.patch.dFrom, r.patch.dTo], ['2027-10-24', '2027-11-01'], t);
  }
  // v pátek 30. 10. se ještě stihne
  assert.deepEqual([P('Mallorca na podzimní prázdniny', '2026-10-30').patch.dFrom, P('Mallorca na podzimní prázdniny', '2026-10-30').patch.dTo], ['2026-10-30', '2026-11-01']);
  assert.deepEqual(P('Londýn s odbaveným zavazadlem 20 kg').to, ['Londýn']);
  const r = P('Neapol v pátek po práci');
  assert.deepEqual(r.to, ['Neapol']);
  assert.ok(chips(r).some(c => /čas letu/.test(c)), 'po práci = čas letu ve Filtrech');
});

test('„o víkendu“ s jiným termínem je jen délka (dřív vyhrál tento víkend); „na Mikuláše“ je termín, ne místo', () => {
  const t = '2026-11-01';
  const d = P('Vídeň v prosinci o víkendu', t);
  assert.deepEqual([d.to, d.patch.dFrom, d.patch.dTo, d.patch.len], [['Vídeň'], '2026-12-01', '2026-12-31', 'weekend']);
  const a = P('adventní trhy v Drážďanech o víkendu', t);
  assert.deepEqual([a.to, a.patch.dFrom, a.patch.dTo, a.patch.len], [['Drážďanech'], '2026-11-27', '2026-12-21', 'weekend']);
  // bez jiného termínu dál nejbližší víkend
  const l = P('Londýn o víkendu', t);
  assert.deepEqual([chips(l)[0], l.patch.dFrom, l.patch.dTo], ['tento víkend', '2026-11-01', '2026-11-07']);
  const m = P('na Mikuláše do Amsterdamu', t);
  assert.deepEqual([m.to, m.patch.dFrom, m.patch.dTo, m.patch.len], [['Amsterdamu'], '2026-12-03', '2026-12-06', 'weekend']);
  // Liptovský Mikuláš je místo
  assert.deepEqual(P('do Liptovského Mikuláše v prosinci', t).to, ['Liptovského Mikuláše']);
});

test('„přes Vánoce a Silvestr“ (i obráceně, i Nový rok): odlet před Štědrým dnem, návrat po Novém roce ± 1 den', () => {
  const t = '2026-11-01';
  for (const q of ['Kanáry přes Vánoce a Silvestr', 'přes Silvestr a Vánoce na Tenerife', 'Vánoce a Nový rok v Thajsku', 'Vánoce a Silvestr v Londýně']) {
    const r = P(q, t);
    assert.deepEqual([r.patch.dateMode, r.patch.xOut, r.patch.xBack, r.patch.xFlex], ['exact', '2026-12-23', '2027-01-02', 1], q);
    assert.deepEqual(chips(r), ['Vánoce i Silvestr (23. 12. – 2. 1. ± 1 den)'], q);
  }
  // delší pobyt: návrat po Novém roce zůstane, odlet dřív
  assert.equal(P('Vánoce a Silvestr na Kanárech na 2 týdny', t).patch.xOut, '2026-12-19');
  // samotné Vánoce / Silvestr beze změny
  assert.equal(P('o Vánocích do Říma', t).patch.len, 'holiday');
  assert.deepEqual([P('Silvestr v Londýně', t).patch.dFrom, P('Silvestr v Londýně', t).patch.dTo], ['2026-12-27', '2026-12-31']);
});

test('Objevuj větou: rozsah dat („Paříž 20.–23. 11.“) dá počet dní; samotné datum ne', () => {
  const E = (q) => JSON.parse(JSON.stringify(Smart.parseExplore(q, { today: '2026-11-01' })));
  assert.deepEqual([E('Paříž 20.-23.11.').days, E('Paříž 20.-23.11.').start], [4, '2026-11-20']);
  assert.equal(E('Řím od 5.12. do 7.12.').days, 3);
  // jen začátek: počet dní zůstane na Objevuj (ne dopočtený týden z hledání letů)
  assert.equal(E('Paříž 20.11.').days, null);
  // delší než 14 dní: program by byl moc dlouhý – dny se nenastaví
  assert.equal(E('Lisabon 1.12.–30.12.').days, null);
  assert.equal(E('Řím 3 noci od 5.12.').days, 4, 'noci + 1 dál');
});

test('Objevuj větou: pláže = příroda, zoo / aquapark = s dětmi, kavárny / jídlo / nákupy nejsou místo', () => {
  const E = (q) => JSON.parse(JSON.stringify(Smart.parseExplore(q, { today: '2026-11-01' })));
  assert.deepEqual([E('Barcelona pláže a muzea').place, E('Barcelona pláže a muzea').interests], ['Barcelona', ['art', 'nature']]);
  assert.deepEqual([E('Vídeň zoo s dětmi').place, E('Vídeň zoo s dětmi').interests], ['Vídeň', ['kids']]);
  assert.deepEqual([E('Zoo Dvůr Králové').place, E('Zoo Dvůr Králové').interests], ['Dvůr Králové', ['kids']]);
  assert.deepEqual([E('Praha s dětmi zoo a aquapark').place, E('Krakov kavárny').place, E('Londýn nákupy').place], ['Praha', 'Krakov', 'Londýn']);
  // „Plaza“ není pláž
  assert.deepEqual(E('Madrid Plaza Mayor').interests, []);
});

test('„2x dospělý 1x dítě“ (jako v rezervacích) a „1 dospělý“: počty osob, ne místo', () => {
  const r = P('Řím 2x dospělý 1x dítě');
  assert.deepEqual([r.to, r.patch.adults, r.patch.children], [['Řím'], 2, 1]);
  const l = P('Londýn 3x dospělý, 2x dítě, 1x miminko');
  assert.deepEqual([l.to, l.patch.adults, l.patch.children, l.patch.infants], [['Londýn'], 3, 2, 1]);
  assert.deepEqual([P('Paříž 1 dospělý').to, P('Paříž 1 dospělý').patch.adults], [['Paříž'], 1]);
});

test('„4.–6. 12. nebo 11.–13. 12.“: odlet v jeden z obou dnů se stejnou délkou (dřív druhý termín zahozený)', () => {
  const t = '2026-11-01';
  const r = P('Řím víkend 4.-6.12. nebo 11.-13.12.', t);
  assert.deepEqual([r.patch.dateMode, r.patch.dFrom, r.patch.dTo, r.patch.nMin, r.patch.nMax, r.patch.outDays, r.patch.backDays], ['flex', '2026-12-04', '2026-12-11', 2, 2, [5], [0]]);
  assert.equal(chips(r)[0], '4. 12. – 6. 12. nebo 11. 12. – 13. 12.');
  assert.deepEqual([P('Londýn 4.12.-6.12. nebo 11.12.-13.12.', t).patch.dFrom, P('Londýn 4.12.-6.12. nebo 11.12.-13.12.', t).patch.dTo], ['2026-12-04', '2026-12-11']);
  // jiná délka: první termín zůstane
  assert.deepEqual([P('Řím 4.-6.12. nebo 11.-20.12.', t).patch.dateMode, P('Řím 4.-6.12. nebo 11.-20.12.', t).patch.xBack], ['exact', '2026-12-06']);
});

test('svátek jménem („na Den boje za svobodu“, „na 1. máje“, „svatého Václava“) a „nejbližší prodloužený víkend“ = termín, ne místo', () => {
  const t = '2026-11-01';
  const PL = q => JSON.parse(JSON.stringify(Smart.parse(q, { today: t, presets, holidays: H.holidayList(t), holidayDates: H.holidayDates, longWeekend: H.longWeekend })));
  const b = PL('Londýn na Den boje za svobodu');
  assert.deepEqual([b.to, chips(b), b.patch.len, b.patch.dFrom, b.patch.dTo], [['Londýn'], ['Den boje za svobodu'], 'holiday', '2026-11-13', '2026-11-14']);
  const n = PL('na nejbližší prodloužený víkend');
  assert.deepEqual([n.to, chips(n)], [[], ['Den boje za svobodu']]);
  // svátek mimo seznam: prodloužený víkend spočtený (o.longWeekend) – Cyril a Metoděj 2027 po 5. 7.
  const c = PL('Paříž na Cyrila a Metoděje');
  assert.deepEqual([c.to, c.patch.len, c.patch.dFrom, c.patch.dTo], [['Paříž'], 'holiday', '2027-07-02', '2027-07-03']);
  // svátek v sobotu (1. 5. 2027) – prodloužený víkend není: pár dní před ním s délkou prodlouženého víkendu
  const m = PL('na 1. máje do Říma');
  assert.deepEqual([m.to, chips(m)[0], m.patch.dFrom, m.patch.dTo, m.patch.len], [['Říma'], 'Svátek práce', '2027-04-27', '2027-05-01', 'long']);
  assert.deepEqual(PL('o svatém Václavu do Berlína').to, ['Berlína']);
  // datum zůstává datem
  assert.equal(PL('17. listopadu do Vídně').patch.dateMode, 'exact');
});

test('měsíc navíc k datu v něm („Řím 4.–6. 12. v prosinci“) není místo', () => {
  const t = '2026-11-01';
  assert.deepEqual([P('Řím 4.-6.12. v prosinci', t).to, P('Řím 4.-6.12. v prosinci', t).patch.xOut], [['Řím'], '2026-12-04']);
  assert.deepEqual(P('Londýn 12.11. v listopadu', t).to, ['Londýn']);
  // jiný měsíc než datum: nic se nepolyká potichu (rozpor zůstane vidět)
  assert.deepEqual(P('Řím 12.11. v prosinci', t).to, ['Řím', 'prosinci']);
});

test('Objevuj větou: svátek a víkend v měsíci – začátek a počet dní („na Den boje za svobodu“, „o víkendu v prosinci“)', () => {
  const t = '2026-11-01';
  const E = (q, hol = true) => JSON.parse(JSON.stringify(Smart.parseExplore(q, { today: t, ...(hol ? { holidays: H.holidayList(t), holidayDates: H.holidayDates, longWeekend: H.longWeekend } : {}) })));
  // „na Den“ tu není „na den“ (1 den) – dřív místo „Paříž boje“
  assert.deepEqual([E('Paříž na Den boje za svobodu').place, E('Paříž na Den boje za svobodu').start, E('Paříž na Den boje za svobodu').days], ['Paříž', '2026-11-14', 4]);
  assert.deepEqual([E('Řím o Vánocích').start, E('Řím o Vánocích').days], ['2026-12-24', 4]);
  assert.deepEqual([E('Krakov na nejbližší prodloužený víkend').start, E('Krakov na nejbližší prodloužený víkend').days], ['2026-11-14', 4]);
  // víkend v pružném termínu: od první soboty v něm
  assert.deepEqual([E('Vídeň o víkendu v prosinci').start, E('Vídeň o víkendu v prosinci').days], ['2026-12-05', 2]);
  assert.equal(E('Drážďany adventní trhy na víkend').start, '2026-11-28');
  assert.deepEqual([E('Londýn na Mikuláše').start, E('Londýn na Mikuláše').days], ['2026-12-05', 2]);
  // beze změny
  assert.equal(E('Praha na den').days, 1);
  assert.deepEqual([E('Porto na víkend').start, E('Krakov na prodloužený víkend').start], ['2026-11-07', '2026-11-06']);
});

test('„✨ Zkus napsat“ před Vánoci nabídne „Kanáry přes Vánoce a Silvestr“ a ta věta dá Vánoce i Silvestr', () => {
  const src = readFileSync(new URL('../public/js/flights.js', import.meta.url), 'utf8');
  assert.match(src, /const xmas = nm === 11 \|\| \(nm === 0 && t\.slice\(8\) <= '20'\);/);
  // nm = index příštího měsíce: listopad → 11, prosinec → 0, říjen → 10 (bez příkladu)
  const nmOf = t => (+t.slice(5, 7)) % 12, xm = t => nmOf(t) === 11 || (nmOf(t) === 0 && t.slice(8) <= '20');
  assert.deepEqual(['2026-10-31', '2026-11-01', '2026-11-30', '2026-12-20', '2026-12-21'].map(xm), [false, true, true, true, false]);
  assert.match(src, /\.\.\.\(xmas \? \['Kanáry přes Vánoce a Silvestr'\] : \[\]\)/);
  assert.equal(P('Kanáry přes Vánoce a Silvestr', '2026-11-01').patch.xFlex, 1);
});

test('překlep v dlouhém měsíci za „v“ („v prosnci“, „v listpadu“) a „vykend“: termín, ne místo', () => {
  const t = '2026-11-01';
  const r = P('Řím v prosnci', t);
  assert.deepEqual([r.to, chips(r), r.patch.dFrom, r.patch.dTo], [['Řím'], ['prosinec'], '2026-12-01', '2026-12-31']);
  assert.deepEqual([P('v listpadu do rima', t).to, chips(P('v listpadu do rima', t))], [['rima'], ['listopad']]);
  assert.deepEqual([P('Řím na vykend', t).to, P('Řím na vykend', t).patch.len], [['Řím'], 'weekend']);
  assert.deepEqual([P('Paříž o vykendu', t).to, chips(P('Paříž o vykendu', t))[0]], [['Paříž'], 'tento víkend']);
  // krátké měsíce a místa podobná měsíci zůstávají (Ledeč ≠ leden, Prosecco není prosinec)
  assert.deepEqual(P('Řím v Prosecco', t).to, ['Řím', 'Prosecco']);
  assert.deepEqual(P('Ledeč v prosinci', t).to, ['Ledeč']);
});

test('„do / před Vánoci“, „po Vánocích“ (i Velikonoce) = období před / po svátku, ne o svátcích', () => {
  const t = '2026-11-01';
  const d = P('Londýn kdykoliv do Vánoc', t);
  assert.deepEqual([d.to, chips(d), d.patch.dFrom, d.patch.dTo, d.patch.len], [['Londýn'], ['do Vánoc'], '2026-11-02', '2026-12-23', undefined]);
  const p = P('před Vánoci do Říma', t);
  assert.deepEqual([p.to, chips(p)], [['Říma'], ['před Vánoci']]);
  const a = P('po Vánocích do Londýna', t);
  assert.deepEqual([chips(a), a.patch.dFrom, a.patch.dTo], [['po Vánocích'], '2026-12-27', '2027-01-16']);
  assert.deepEqual([chips(P('do Velikonoc do Paříže', t)), P('do Velikonoc do Paříže', t).patch.dTo], [['do Velikonoc'], '2027-03-25']);
  // s víkendem: víkendy v tom období
  assert.equal(P('Řím ještě před Vánoci na víkend', t).patch.len, 'weekend');
  // beze změny: o Vánocích, s datem po Vánocích
  assert.equal(P('o Vánocích do Říma', t).patch.len, 'holiday');
  assert.equal(P('po Vánocích do Londýna 28.12.', t).patch.xOut, '2026-12-28');
});

test('„před Silvestrem“, „po Novém roce“, „hned po / těsně před“: období kolem svátku', () => {
  const t = '2026-11-01';
  const n = P('po Novém roce do Londýna', t);
  assert.deepEqual([n.to, chips(n), n.patch.dFrom, n.patch.dTo], [['Londýna'], ['po Novém roce'], '2027-01-02', '2027-01-22']);
  const s = P('před Silvestrem do Říma', t);
  assert.deepEqual([s.to, chips(s), s.patch.dTo], [['Říma'], ['před Silvestrem'], '2026-12-30']);
  // „hned po“ / „těsně před“: jen týden u svátku
  assert.deepEqual([P('hned po Vánocích do Prahy', t).to, P('hned po Vánocích do Prahy', t).patch.dTo], [['Prahy'], '2027-01-02']);
  assert.deepEqual([P('těsně před Vánoci do Londýna', t).patch.dFrom, P('těsně před Vánoci do Londýna', t).patch.dTo], ['2026-12-17', '2026-12-23']);
  // beze změny
  assert.equal(P('na Silvestra do Londýna', t).patch.dTo, '2026-12-31');
  assert.equal(P('na Nový rok do Berlína', t).patch.len, 'holiday');
});

test('„kolem 15.12.“, „okolo 20. listopadu“, „cca 3.12.“: okolní dny ± 2 (dřív přesně ten den)', () => {
  const t = '2026-11-01';
  const r = P('Řím 3 noci kolem 15.12.', t);
  assert.deepEqual([r.patch.xOut, r.patch.xBack, r.patch.xFlex, chips(r)[0]], ['2026-12-15', '2026-12-18', 2, '15. 12. – 18. 12. ± 2 dny']);
  assert.equal(P('Vídeň kolem 20. listopadu', t).patch.xFlex, 2);
  assert.equal(P('cca 3.12. do Říma', t).patch.xFlex, 2);
  // bez „kolem“ přesně; „kolem 5.000 Kč“ není datum
  assert.equal(P('Londýn 15.12.', t).patch.xFlex, 0);
  assert.equal(P('Řím 15.12. za kolem 5.000 Kč', t).patch.xFlex, 0);
});
