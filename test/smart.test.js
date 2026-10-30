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
